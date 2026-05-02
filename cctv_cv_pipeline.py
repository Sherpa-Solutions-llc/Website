import cv2
import time
import requests
import logging
import numpy as np

# Set up logging for tracking API calls and errors
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')


# ==========================================
# OPTION 1: TRANSPORT FOR LONDON (TFL) API
# ==========================================

TFL_API_KEY = "YOUR_TFL_API_KEY"
TFL_CAMERA_ENDPOINT = "https://api.tfl.gov.uk/Place/Type/JamCam"

# Rate Limiting: TfL allows ~500 requests per minute.
TFL_REQUESTS_PER_MINUTE = 400 
TFL_SLEEP_BETWEEN_REQUESTS = 60.0 / TFL_REQUESTS_PER_MINUTE

# Frame Extraction Rule: e.g., 1 frame every 5 seconds of the MP4 clip
TFL_FRAME_INTERVAL_SECONDS = 5

def tfl_get_video_urls(api_key):
    """Fetches the list of JamCam MP4 URLs from the TfL API."""
    urls = []
    headers = {"Cache-Control": "no-cache"}
    params = {}
    if api_key != "YOUR_TFL_API_KEY":
        params["app_key"] = api_key
        
    try:
        response = requests.get(TFL_CAMERA_ENDPOINT, params=params, headers=headers)
        response.raise_for_status()
        places = response.json()
        
        for place in places:
            # The MP4 url is stored in the additionalProperties array
            for prop in place.get("additionalProperties", []):
                if prop.get("key") == "videoUrl":
                    video_url = prop.get("value")
                    if video_url:
                        urls.append((place.get("id"), video_url))
                        
        logging.info(f"Retrieved {len(urls)} TfL JamCam video URLs.")
        return urls
        
    except requests.exceptions.HTTPError as e:
        if response.status_code == 403:
            logging.error("403 Forbidden: TfL network restriction active or invalid API key.")
        else:
            logging.error(f"HTTP error fetching TfL cameras: {e}")
    except Exception as e:
        logging.error(f"Error fetching TfL cameras: {e}")
    
    return []

def tfl_extract_frames_from_video(camera_id, video_url, interval_seconds):
    """
    Downloads and extracts frames from an MP4 clip using OpenCV without streaming the whole thing into memory.
    """
    cap = cv2.VideoCapture(video_url)
    if not cap.isOpened():
        logging.warning(f"Could not open video URL: {video_url}")
        return 0

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps == 0 or fps != fps: # Handle 0 or NaN if headers are missing
        fps = 25 # Standard UK video framerate fallback
        
    frames_to_skip = int(fps * interval_seconds)
    frame_count = 0
    extracted_count = 0
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break # Reached the end of the short 10-second clip
            
        if frame_count % frames_to_skip == 0:
            # ---> PIPE TO OBJECT DETECTION HERE <---
            process_frame_in_model(frame, camera_id)
            extracted_count += 1
                
        frame_count += 1

    cap.release()
    return extracted_count

def run_tfl_pipeline():
    """Main execution loop for Option 1: The TfL Video Pipeline"""
    logging.info("Starting Option 1: TfL JamCam OpenCV Pipeline...")
    
    while True:
        video_urls = tfl_get_video_urls(TFL_API_KEY)
        
        if not video_urls:
            logging.warning("No TfL URLs found. Switching to Backup Pipeline...")
            return False # Trigger fallback
            
        for cam_id, url in video_urls:
            # Obey the API rate limit so we don't trigger the WAF 403 blocks
            time.sleep(TFL_SLEEP_BETWEEN_REQUESTS)
            
            logging.info(f"Extracting frames from TfL Cam: {cam_id}")
            extracted = tfl_extract_frames_from_video(cam_id, url, TFL_FRAME_INTERVAL_SECONDS)
            logging.info(f"Successfully sent {extracted} frames to the Object Detection model.")
            
        return True


# ==========================================
# OPTION 2: BACKUP - NATIONAL HIGHWAYS (STATIC)
# ==========================================

NH_API_KEY = "YOUR_NH_API_KEY"
NH_CAMERA_ENDPOINT = "https://api.nationalhighways.co.uk/cctv/v1/cameras"
NH_POLL_INTERVAL_SECONDS = 5 # Refresh interval for static images

def nh_get_cameras(api_key):
    """Fetches the list of National Highways CCTV cameras."""
    urls = []
    headers = {
        "Ocp-Apim-Subscription-Key": api_key,
        "Cache-Control": "no-cache"
    }
    
    if api_key == "YOUR_NH_API_KEY":
        logging.warning("No National Highways API key provided. Using public proxy if available...")

    try:
        response = requests.get(NH_CAMERA_ENDPOINT, headers=headers)
        response.raise_for_status()
        data = response.json()
        
        for camera in data.get("cameras", []):
            image_url = camera.get("imageUrl")
            if image_url:
                urls.append((camera.get("id"), image_url))
        
        logging.info(f"Retrieved {len(urls)} National Highways cameras.")
        return urls
    except Exception as e:
        logging.error(f"Error fetching National Highways cameras: {e}")
    
    return []

def nh_fetch_and_process_image(camera_id, image_url):
    """Fetches a static image and decodes it immediately into a CV2 numpy array."""
    try:
        response = requests.get(image_url, stream=True, timeout=5)
        response.raise_for_status()
        
        # Read the image bytes and decode using OpenCV
        image_array = np.asarray(bytearray(response.content), dtype=np.uint8)
        frame = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        
        if frame is not None:
            # ---> PIPE TO OBJECT DETECTION HERE <---
            process_frame_in_model(frame, camera_id)
            return True
            
    except Exception as e:
        logging.error(f"Image processing error {camera_id}: {e}")
        
    return False

def run_nh_backup_pipeline():
    """Execution loop for Option 2: The static Image Highway Pipeline"""
    logging.info("Starting Option 2: National Highways Backup Pipeline...")
    
    cameras = nh_get_cameras(NH_API_KEY)
    if not cameras:
        logging.error("Backup failed. No National Highways cameras accessible.")
        return

    # To avoid overwhelming the network, we select a batch of cameras
    target_cameras = cameras[:20] 

    while True:
        for cam_id, url in target_cameras:
            success = nh_fetch_and_process_image(cam_id, url)
            if success:
                logging.info(f"Processed CV2 frame for NH camera: {cam_id}")
            time.sleep(0.5) # Slight delay between camera fetching
            
        logging.info(f"Batch complete. Sleeping for {NH_POLL_INTERVAL_SECONDS} seconds before repolling.")
        time.sleep(NH_POLL_INTERVAL_SECONDS)


# ==========================================
# UNIVERSAL OBJECT DETECTION INGESTION
# ==========================================

def process_frame_in_model(cv2_frame, camera_id):
    """
    MODULAR ATTACHMENT POINT:
    This function receives the exact raw CV2 numpy array from either Option 1 or Option 2.
    You can easily drop your YOLOv8 or PyTorch model here.
    """
    # Example integration:
    # results = yolo_model(cv2_frame)
    # vehicles_counted = len(results.boxes)
    # db.save_count(camera_id, vehicles_counted)
    pass


# ==========================================
# MAIN EXECUTION ROUTINE
# ==========================================

if __name__ == "__main__":
    logging.info("Initializing CV2 Pipeline Orchestrator...")
    
    try:
        # Attempt Primary Option (TfL Video)
        success = run_tfl_pipeline()
        
        # If Option 1 throws a 403 Cyber Restriction or fails, fall back to Option 2
        if not success:
            run_nh_backup_pipeline()
            
    except KeyboardInterrupt:
        logging.info("Pipeline stopped by administrator.")

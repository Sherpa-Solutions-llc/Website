import os

with open('server.py', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Replace the modal definitions
start_modal = content.find('/* ---- image modal ---- */')
end_modal = content.find('/* ---- toast ---- */')

new_modal_code = """        /* ---- media modal ---- */
        let _mediaEl = null, _mediaImgTag = null;

        const mediaOverlay = document.createElement('div');
        mediaOverlay.id = '_cms_media_overlay';
        mediaOverlay.innerHTML = `
            <div id="_cms_img_box">
                <h3>Media Settings</h3>
                <p>Update the image and optional video link.</p>
                <div id="_cms_img_preview" style="text-align: center; margin-bottom: 1rem;"><img style="max-height: 100px; max-width: 100%; border-radius: 8px;"></div>
                
                <label>Image URL</label>
                <input type="text" id="_cms_media_img_url" placeholder="https://... or /static/filename.jpg">
                <label style="font-weight: normal; margin-top:-0.5rem; display:block;">— or upload image —</label>
                <input type="file" id="_cms_media_img_file" accept="image/*">
                
                <label style="margin-top: 1rem;">Video Embed URL (Optional)</label>
                <input type="text" id="_cms_media_vid_url" placeholder="https://www.youtube.com/embed/...">
                <label style="font-weight: normal; margin-top:-0.5rem; display:block;">— or upload video (.mp4) —</label>
                <input type="file" id="_cms_media_vid_file" accept="video/mp4,video/*">
                
                <div class="img-actions" style="margin-top: 1rem;">
                    <button class="img-btn-cancel" id="_cms_media_cancel" style="background: #ccc;">Cancel</button>
                    <button class="img-btn-apply"  id="_cms_media_apply">Apply Media</button>
                </div>
            </div>`;
        mediaOverlay.style.display = 'none';
        mediaOverlay.style.position = 'fixed';
        mediaOverlay.style.inset = '0';
        mediaOverlay.style.background = 'rgba(0,0,0,0.72)';
        mediaOverlay.style.zIndex = '2147483646';
        mediaOverlay.style.alignItems = 'center';
        mediaOverlay.style.justifyContent = 'center';
        document.body.appendChild(mediaOverlay);

        document.getElementById('_cms_media_cancel').onclick = () => mediaOverlay.style.display = 'none';

        async function getMediaInputUrl(inputId, fileId) {
            const fileInput = document.getElementById(fileId);
            const urlInput = document.getElementById(inputId);
            if (fileInput.files && fileInput.files.length > 0) {
                const fd = new FormData();
                fd.append('file', fileInput.files[0]);
                const r = await fetch('/api/upload', { method: 'POST', body: fd });
                if (r.ok) return (await r.json()).url;
            }
            let url = urlInput.value.trim();
            if (url.includes('youtube.com/watch?v=')) {
                url = url.replace('youtube.com/watch?v=', 'youtube.com/embed/').split('&')[0];
            } else if (url.includes('youtu.be/')) {
                url = url.replace('youtu.be/', 'youtube.com/embed/').split('?')[0];
            }
            return url;
        }

        document.getElementById('_cms_media_apply').onclick = async function() {
            toast('Processing...', 'var(--accent)');
            const imgUrl = await getMediaInputUrl('_cms_media_img_url', '_cms_media_img_file');
            const vidUrl = await getMediaInputUrl('_cms_media_vid_url', '_cms_media_vid_file');
            
            if (!imgUrl) {
                toast('Image is required', '#e67e22'); return;
            }

            if (_mediaEl) {
                if (_mediaImgTag) _mediaImgTag.src = imgUrl;
                
                if (vidUrl) {
                    _mediaEl.setAttribute('data-video-src', vidUrl);
                    if (!_mediaEl.classList.contains('video-thumbnail') && _mediaEl.tagName !== 'IMG') {
                        _mediaEl.classList.add('video-thumbnail');
                    }
                } else {
                    _mediaEl.removeAttribute('data-video-src');
                    _mediaEl.classList.remove('video-thumbnail');
                }
                
                const id = _mediaEl.getAttribute('data-cms');
                if (id) {
                    let payload;
                    if (vidUrl) {
                        payload = JSON.stringify({ img: imgUrl, video: vidUrl });
                    } else {
                        payload = imgUrl;
                    }
                    markDirty(id, payload);
                    toast('\u2713 Media widget updated');
                }
            }
            mediaOverlay.style.display = 'none';
        };

"""
content = content[:start_modal] + new_modal_code + content[end_modal:]

# 2. Replace the click listener logic
click_handler_start = content.find("const img = el.tagName === 'IMG' ? el : el.querySelector('img');")
click_handler_end = content.find("if (el.tagName === 'P' || el.tagName === 'H1'")

new_click_handler = """const img = el.tagName === 'IMG' ? el : el.querySelector('img');
                if (img || el.hasAttribute('data-video-src')) {
                    _mediaEl = el;
                    _mediaImgTag = img;
                    
                    const currentImgUrl = img ? (img.getAttribute('src') || '') : '';
                    const currentVidUrl = el.getAttribute('data-video-src') || '';
                    
                    document.getElementById('_cms_media_img_url').value = currentImgUrl;
                    document.getElementById('_cms_media_img_file').value = '';
                    document.getElementById('_cms_media_vid_url').value = currentVidUrl;
                    document.getElementById('_cms_media_vid_file').value = '';
                    
                    document.querySelector('#_cms_img_preview img').src = currentImgUrl;
                    mediaOverlay.style.display = 'flex';
                    return;
                }
                
                """
content = content[:click_handler_start] + new_click_handler + content[click_handler_end:]

with open('server.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("Replaced server.py modal logic.")

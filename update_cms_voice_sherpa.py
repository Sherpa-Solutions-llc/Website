import sqlite3
import os

db_path = 'sherpa_cms.db'
if not os.path.exists(db_path):
    print(f"Error: {db_path} not found.")
    exit(1)

db = sqlite3.connect(db_path)

new_content = """
                    <div class="product-img" style="height: 240px; background: #0b110b; padding: 10px;">
                        <img src="static/voice_sherpa_thumb.png" alt="Voice Sherpa AI Assistant" style="object-fit: contain; width: 100%; height: 100%;" data-cms="project-card-img-voice-sherpa">
                    </div>
                    <div class="product-info">
                        <h3 class="product-title" style="margin-bottom: 0.5rem; color: var(--accent);" data-cms="project-card-title-voice-sherpa">Voice Sherpa</h3>
                        <p style="color: var(--text-dark); font-size: 0.95rem; line-height: 1.5; margin-bottom: 1rem;" data-cms="project-card-desc-voice-sherpa">
                            Natural language voice interface for enterprise agents. Features low-latency STT/TTS integration and a custom-designed mountain-themed pulse interaction.
                        </p>
                        <div class="product-btn" style="margin-top: auto;">
                            <span class="btn btn-primary" style="width: 100%;" data-cms="project-card-btn-voice-sherpa">Talk to Sherpa <i class="fa-solid fa-microphone-lines" style="margin-left: 0.5rem;"></i></span>
                        </div>
                    </div>
"""

db.execute("UPDATE content SET html_content = ? WHERE element_id = ?", (new_content, 'project-link-voice-sherpa'))
db.commit()
db.close()
print("Successfully updated CMS database for 'project-link-voice-sherpa'.")

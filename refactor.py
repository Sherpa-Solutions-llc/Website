from bs4 import BeautifulSoup
import re

with open('services.html', 'r', encoding='utf-8') as f:
    html = f.read()

soup = BeautifulSoup(html, 'html.parser')

sections = soup.find_all('section', class_=re.compile(r'service-detail-bg'))
for sec in sections:
    # Remove service-detail-bg class
    classes = sec.get('class', [])
    if 'service-detail-bg' in classes:
        classes.remove('service-detail-bg')
    sec['class'] = classes
    
    # Extract background image
    style = sec.get('style', '')
    match = re.search(r"url\('(.+?)'\)", style)
    img_src = match.group(1) if match else ''
    
    # Remove style
    if 'style' in sec.attrs:
        del sec['style']
    
    # Add image div
    wrapper = sec.find('div', class_='service-detail-wrapper')
    if wrapper and img_src:
        img_div = soup.new_tag('div', **{'class': 'service-detail-image'})
        img = soup.new_tag('img', src=img_src, alt=sec.find('h3').get_text(strip=True) if sec.find('h3') else '')
        img_div.append(img)
        wrapper.append(img_div)

# Write back
with open('services.html', 'w', encoding='utf-8') as f:
    # Use formatter=None to avoid bs4 adding extra closing tags to self closing tags or altering html too much
    f.write(str(soup))
print("Refactored services.html successfully!")

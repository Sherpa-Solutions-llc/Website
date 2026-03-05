import httpx

urls = [
    "https://cdn.shopify.com/s/files/1/2986/1172/products/BTR-45-BK-1_BTR-45-BK-1-p_ecomm_2.jpg",
    "https://cdn.shopify.com/s/files/1/2986/1172/products/BTR-45-BK-1_BTR-45-BK-1-p_ecomm_3.jpg",
    "https://cdn.shopify.com/s/files/1/2986/1172/products/BTR-45-BK-1_BTR-45-BK-1-p_ecomm_4.jpg",
    "https://cdn.shopify.com/s/files/1/2986/1172/products/BTR-45-BK-1_BTR-45-BK-1-p_ecomm_5.jpg",
    "https://cdn.shopify.com/s/files/1/2986/1172/products/BTR-45-BK-1_BTR-45-BK-1-p_ecomm_6.jpg",
]

for url in urls:
    resp = httpx.get(url)
    print(resp.status_code, url)

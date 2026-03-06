from rembg import remove
from PIL import Image

input_path = "D:/KULIAH/Tugas_akhir/logo fix.jpeg"
output_path = "d:/KULIAH/Tugas_akhir/frontend/img/logo.png"

print("Memproses gambar untuk menghapus background...")
try:
    input_image = Image.open(input_path)
    # Gunakan post_process=True untuk merapikan tepi (alpha matting jika perlu)
    output_image = remove(input_image)
    output_image.save(output_path)
    print(f"Berhasil! Gambar transparan disimpan di: {output_path}")
except Exception as e:
    print(f"Error: {e}")

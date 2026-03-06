import zipfile
import xml.etree.ElementTree as ET
import sys
import io

def extract_text(docx_path):
    try:
        with zipfile.ZipFile(docx_path) as docx:
            xml_content = docx.read('word/document.xml')
            tree = ET.fromstring(xml_content)
            ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
            
            text = []
            for paragraph in tree.findall('.//w:p', ns):
                texts = [node.text for node in paragraph.findall('.//w:t', ns) if node.text]
                if texts:
                    text.append("".join(texts))
            return "\n".join(text)
    except Exception as e:
        return str(e)

if __name__ == '__main__':
    doc_path = sys.argv[1]
    out_path = sys.argv[2]
    content = extract_text(doc_path)
    with io.open(out_path, "w", encoding="utf-8") as f:
        f.write(content)

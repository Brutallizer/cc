import os
import glob

def replace_in_file(filepath, replacements):
    enc = 'utf-8'
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except UnicodeDecodeError:
        enc = 'utf-16'
        with open(filepath, 'r', encoding='utf-16') as f:
            content = f.read()

    new_content = content
    for old, new in replacements.items():
        new_content = new_content.replace(old, new)

    if new_content != content:
        with open(filepath, 'w', encoding=enc) as f:
            f.write(new_content)
        print(f"Updated {filepath}")

def main():
    replacements = {
        "CertiChain": "CredBlock",
        "certichain": "credblock",
        "CERTICHAIN": "CREDBLOCK",
        "Certi<span class=\"text-primary-600\">Chain</span>": "Cred<span class=\"text-primary-600\">Block</span>",
        "Pendaftaran Institusi | CertiChain": "Pendaftaran Institusi | CredBlock",
        "Verifikasi Ijazah Digital | CertiChain": "Verifikasi Ijazah Digital | CredBlock",
        "Dashboard Admin | CertiChain": "Dashboard Admin | CredBlock",
        "Pendaftaran Institusi | CredBlock": "Pendaftaran Institusi | CredBlock", # Just in case
    }

    # Extend replacements to handle specific logo letter
    replacements["<div\n                        class=\"w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-bold text-lg shadow-sm\">\n                        C\n                    </div>"] = "<div\n                        class=\"w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-bold text-lg shadow-sm\">\n                        CB\n                    </div>"

    extensions = ['*.html', '*.js', '*.sol', '*.md']
    folders = ['frontend', 'frontend/js', 'contracts', 'scripts', 'test', '.']

    for folder in folders:
        for ext in extensions:
            for filepath in glob.glob(os.path.join(folder, ext)):
                if os.path.isfile(filepath):
                    replace_in_file(filepath, replacements)

    # Rename files
    if os.path.exists("contracts/CertiChain.sol"):
        os.rename("contracts/CertiChain.sol", "contracts/CredBlock.sol")
        print("Renamed contracts/CertiChain.sol to contracts/CredBlock.sol")
        
    if os.path.exists("test/CertiChain.test.js"):
        os.rename("test/CertiChain.test.js", "test/CredBlock.test.js")
        print("Renamed test/CertiChain.test.js to test/CredBlock.test.js")
        
    if os.path.exists("scripts/deploy_v2.js"):
        replace_in_file("scripts/deploy_v2.js", {"CertiChain": "CredBlock"})

if __name__ == "__main__":
    main()

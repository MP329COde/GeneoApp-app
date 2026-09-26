#!/usr/bin/env python3
"""
Génère des images de "vieux registres paroissiaux" fictifs pour tester le module OCR
de GeneoApp (src/server/src/ocr, src/server/src/paleography). Toutes les données sont
fictives, inspirées des familles de qa/fixtures/familles/.

Pour chaque image, un fichier .txt du même nom contient le texte EXACT affiché,
utilisable comme référence pour mesurer la précision d'un futur test OCR.

Usage : python3 qa/scripts/generate-ocr-fixtures.py
"""
import os
import random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

random.seed(42)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.normpath(os.path.join(HERE, "..", "fixtures", "ocr"))
os.makedirs(OUT_DIR, exist_ok=True)

# Police "manuscrite/ancienne" — Snell Roundhand est une police calligraphique dispo sur
# macOS. Fallback : DejaVu Serif Italic si indisponible (LIMITE documentée dans PROGRESS.md).
CANDIDATE_FONTS = [
    "/System/Library/Fonts/Supplemental/SnellRoundhand.ttc",
    "/System/Library/Fonts/Supplemental/Bradley Hand Bold.ttf",
    "/System/Library/Fonts/Supplemental/DejaVuSerif-Italic.ttf",
]
FONT_PATH = None
for c in CANDIDATE_FONTS:
    if os.path.exists(c):
        FONT_PATH = c
        break

def get_font(size):
    if FONT_PATH:
        try:
            return ImageFont.truetype(FONT_PATH, size)
        except Exception:
            pass
    return ImageFont.load_default()

# Résolution basse (~150dpi équivalent sur une page A5-ish)
WIDTH, HEIGHT = 1000, 700

SEPIA_BG = (222, 202, 165)
INK = (40, 30, 20)

def make_base_image():
    img = Image.new("RGB", (WIDTH, HEIGHT), SEPIA_BG)
    draw = ImageDraw.Draw(img, "RGBA")
    # Bruit de fond léger
    for _ in range(4000):
        x, y = random.randint(0, WIDTH - 1), random.randint(0, HEIGHT - 1)
        shade = random.randint(-15, 15)
        c = tuple(max(0, min(255, v + shade)) for v in SEPIA_BG)
        draw.point((x, y), fill=c)
    # Taches (formes floues semi-transparentes)
    stains = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(stains)
    for _ in range(6):
        cx, cy = random.randint(0, WIDTH), random.randint(0, HEIGHT)
        r = random.randint(30, 90)
        color = (90, 60, 30, random.randint(25, 60))
        sdraw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
    stains = stains.filter(ImageFilter.GaussianBlur(15))
    img = Image.alpha_composite(img.convert("RGBA"), stains).convert("RGB")
    return img

def draw_text_block(img, lines, font_size=30, line_height=48, start_y=60):
    draw = ImageDraw.Draw(img)
    font = get_font(font_size)
    y = start_y
    for line in lines:
        # léger décalage horizontal aléatoire pour simuler une écriture irrégulière
        x = 60 + random.randint(-4, 8)
        draw.text((x, y), line, font=font, fill=INK)
        y += line_height
    return img

def finalize(img, rotation_deg):
    img = img.rotate(rotation_deg, expand=True, fillcolor=SEPIA_BG)
    img = img.filter(ImageFilter.GaussianBlur(1.1))
    # Réduction/agrandissement pour simuler une basse résolution (~150dpi)
    small = img.resize((img.width // 2, img.height // 2), Image.BILINEAR)
    img = small.resize((img.width, img.height), Image.BILINEAR)
    return img

def save_pair(name, lines, rotation, font_size=30, line_height=48):
    img = make_base_image()
    img = draw_text_block(img, lines, font_size=font_size, line_height=line_height)
    img = finalize(img, rotation)
    png_path = os.path.join(OUT_DIR, f"{name}.png")
    txt_path = os.path.join(OUT_DIR, f"{name}.txt")
    img.save(png_path)
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"Généré : {png_path}")

# --- Contenu des 4 images (vieux français, style registre paroissial XVIIIe) ---

bapteme = [
    "Registre paroissial de Dijon, Bourgogne",
    "L'an mil sept cens trente, le sixiesme jour de may,",
    "a esté baptisé par nous soussigné curé de ceste",
    "paroisse, Pierre, fils légitime de Sieur Dupont",
    "vigneron dud. lieu, et de Jeanne Bernard sa femme.",
    "Le parrain a esté Nicolas Bernard, la marraine",
    "Jeanne Petit, qui ont déclaré ne sçavoir signer",
    "de ce enquis suivant l'ordonnance.",
]

mariage = [
    "Registre paroissial de Dijon, Bourgogne",
    "L'an mil sept cens cinquante deux, le dixiesme",
    "jour d'octobre, après la publication de trois bans",
    "faicte à l'issue de nostre messe paroissiale, sans",
    "opposition, avons receu le mutuel consentement de",
    "mariage entre Pierre Dupont, vigneron, fils de feu",
    "Sieur Dupont, et Jeanne Bernard, fille de Sieur",
    "Bernard, en présence des tesmoins soussignés.",
]

deces = [
    "Registre paroissial de Dijon, Bourgogne",
    "L'an mil sept cens quatre vingt quinze, le troisiesme",
    "jour de mars, est décédé en cette paroisse muni des",
    "sacremens de l'Eglise, Pierre Dupont, vigneron,",
    "aagé d'environ soixante cinq ans, espoux de Jeanne",
    "Bernard, et a esté son corps inhumé le lendemain",
    "au cimetière de cette paroisse en présence des",
    "soussignés parens et amis.",
]

registre_double = [
    "Registre paroissial de Nantes, Bretagne",
    "Bapteme : L'an mil sept cens soixante dix huit,",
    "le vingtiesme jour de janvier, a esté baptisée",
    "Aïssatou, fille de Johann Müller, négociant,",
    "et d'Anne Catherine Weber, son espouse.",
    "",
    "Mariage : Le mesme jour dud. mois, a esté beny",
    "le mariage de Frédéric Müller et Aïssatou N'Diaye",
    "en présence de leurs parens et amis soussignés.",
]

save_pair("acte-bapteme-1730-dupont", bapteme, rotation=3)
save_pair("acte-mariage-1752-dupont-bernard", mariage, rotation=-4, font_size=28, line_height=46)
save_pair("acte-deces-1795-dupont", deces, rotation=2, font_size=28, line_height=46)
save_pair("registre-double-1778-muller-ndiaye", registre_double, rotation=-2, font_size=26, line_height=44)

# Note sur les limites
limites_path = os.path.join(OUT_DIR, "LIMITES.md")
with open(limites_path, "w", encoding="utf-8") as f:
    f.write("# Limites de génération des fixtures OCR\n\n")
    f.write(f"Police utilisée : `{FONT_PATH or 'police par défaut Pillow (aucune police manuscrite/serif trouvée)'}`.\n\n")
    if FONT_PATH and "Snell" in FONT_PATH:
        f.write("Snell Roundhand (calligraphique) était disponible sur cette machine macOS et a été utilisée : "
                "rendu relativement fidèle à une écriture manuscrite ancienne, mais reste plus régulier "
                "qu'une véritable écriture d'époque (pas de variation de pression d'encre, de ratures, "
                "d'abréviations manuscrites réelles).\n")
    f.write("\nAutres limites connues : le bruit, les taches et le flou sont approximatifs et ne "
            "reproduisent pas fidèlement la dégradation réelle du papier ancien ; le vieux français "
            "utilisé est stylisé (orthographe d'époque approximative) et non tiré d'un vrai corpus "
            "paléographique.\n")

print("Fichier de limites écrit :", limites_path)

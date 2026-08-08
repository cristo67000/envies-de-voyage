# -*- coding: utf-8 -*-
"""Génère les icônes PWA de « Mes envies de voyage ».

Dessin : une épingle dorée posée sur un fond ardoise, traversé d'un tracé de
circuit en pointillés — les deux idées de l'application en une image.

Tout est dessiné au quadruple de la taille finale puis réduit : Pillow ne
lisse pas les bords, le suréchantillonnage s'en charge.

    python docs/generer-icones.py
"""
import math
import os
from PIL import Image, ImageDraw

ICI = os.path.dirname(os.path.abspath(__file__))
SORTIE = os.path.join(os.path.dirname(ICI), 'icons')

ARDOISE = (31, 58, 77)
OR = (231, 179, 61)
BLANC = (255, 255, 255)

E = 4  # facteur de suréchantillonnage


def tracer_route(d, taille, alpha=52):
    """Courbe en pointillés, en arrière-plan."""
    pas = taille // 46
    points = []
    for i in range(0, 1001):
        t = i / 1000.0
        x = taille * (0.02 + 0.96 * t)
        y = taille * (0.74 + 0.16 * math.sin(t * math.pi * 1.7 - 0.6))
        points.append((x, y))
    # Pointillés : un segment sur deux.
    long_trait = 26
    for k in range(0, len(points) - long_trait, long_trait * 2):
        d.line(points[k:k + long_trait], fill=(255, 255, 255, alpha),
               width=pas, joint='curve')


def tracer_epingle(d, cx, cy, r, couleur, contour=None, ep_contour=0):
    """Tête ronde + pointe, dessinées d'un seul tenant."""
    pointe = (cx, cy + r * 2.45)
    # Angle où la tangente au cercle rejoint la pointe.
    a = math.asin(min(1.0, r / (pointe[1] - cy)))
    gauche = (cx - r * math.cos(a), cy + r * math.sin(a))
    droite = (cx + r * math.cos(a), cy + r * math.sin(a))
    if contour is not None and ep_contour:
        e = ep_contour
        d.ellipse([cx - r - e, cy - r - e, cx + r + e, cy + r + e], fill=contour)
        d.polygon([(gauche[0] - e, gauche[1]), (droite[0] + e, droite[1]),
                   (pointe[0], pointe[1] + e * 2.2)], fill=contour)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=couleur)
    d.polygon([gauche, droite, pointe], fill=couleur)


def dessiner(taille, marge=0.0):
    """`marge` : proportion de vide autour du motif (zone sûre du masque)."""
    t = taille * E
    im = Image.new('RGBA', (t, t), ARDOISE + (255,))
    calque = Image.new('RGBA', (t, t), (0, 0, 0, 0))
    d = ImageDraw.Draw(calque)

    tracer_route(d, t)
    im = Image.alpha_composite(im, calque)

    d = ImageDraw.Draw(im)
    ech = 1.0 - 2 * marge
    r = t * 0.208 * ech
    cx = t * 0.5
    cy = t * (0.40 * ech + marge * 0.5 + (1 - ech) * 0.10)
    tracer_epingle(d, cx, cy, r, OR, contour=BLANC, ep_contour=t * 0.026 * ech)
    # Œil de l'épingle.
    ri = r * 0.40
    d.ellipse([cx - ri, cy - ri, cx + ri, cy + ri], fill=ARDOISE)

    return im.convert('RGB').resize((taille, taille), Image.LANCZOS)


def coins_arrondis(im, rayon_rel=0.20):
    """Icône « any » : coins adoucis, comme la plupart des lanceurs l'attendent."""
    t = im.size[0]
    masque = Image.new('L', (t * E, t * E), 0)
    ImageDraw.Draw(masque).rounded_rectangle(
        [0, 0, t * E - 1, t * E - 1], radius=int(t * E * rayon_rel), fill=255)
    masque = masque.resize((t, t), Image.LANCZOS)
    sortie = Image.new('RGBA', (t, t), (0, 0, 0, 0))
    sortie.paste(im, (0, 0), masque)
    return sortie


def main():
    os.makedirs(SORTIE, exist_ok=True)
    for taille in (192, 512):
        coins_arrondis(dessiner(taille)).save(
            os.path.join(SORTIE, 'icon-%d.png' % taille), optimize=True)
    # Masquable : le motif tient dans le cercle sûr (80 % du côté), le fond
    # occupe tout le carré — c'est le lanceur qui découpe.
    dessiner(512, marge=0.10).save(
        os.path.join(SORTIE, 'icon-maskable-512.png'), optimize=True)
    for f in sorted(os.listdir(SORTIE)):
        print(f, os.path.getsize(os.path.join(SORTIE, f)), 'octets')


if __name__ == '__main__':
    main()

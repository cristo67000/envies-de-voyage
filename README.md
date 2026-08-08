# Mes envies de voyage

Carnet de repérage cartographique. La carte s'ouvre **vide** — France ou Europe —
et ne contient que ce qu'on y pose : les lieux qu'on a envie de voir, avec un
symbole, des notes, des liens, des photographies. Après la visite, on note le
lieu de une à trois étoiles et on écrit ce qu'on en a pensé.

Application web statique, sans construction, sans dépendance à installer, sans
compte et sans serveur. **Tout reste sur l'appareil.**

---

## Ce qu'elle fait

| | |
|---|---|
| **Poser une envie** | Sur la carte (appui long ou clic droit), à sa position actuelle, depuis une photo géolocalisée, ou par recherche d'un lieu |
| **33 symboles** | Musée, château, phare, cascade, restaurant, gîte, camping, vignoble, grotte, thermes, randonnée… répartis en sept familles de couleur |
| **Notes et liens** | Un texte libre par fiche, autant d'adresses de sites que voulu |
| **Photographies** | Jusqu'à dix par fiche, réduites automatiquement à l'import (trois profils) |
| **Circuits** | Plusieurs envies dans l'ordre, tracées sur la carte, réordonnables, avec optimisation du parcours |
| **Itinéraires** | Vers Google Maps ou OpenStreetMap, pour une envie seule ou un circuit entier |
| **Visites** | État visité, date, une à trois étoiles, commentaire |
| **Sauvegarde** | Archive `.zip` contenant un JSON lisible et les photos en JPEG ; export GPX |
| **Deux appareils** | Réunion de deux carnets par comparaison des dates, suppressions comprises, avec rappel quand l'archive date |

L'interface est la même sur ordinateur et sur téléphone : sur grand écran, la
barre de navigation devient un rail vertical et les panneaux se posent sur les
côtés ; sur téléphone, la barre passe en bas et les panneaux montent du bas.

---

## Lancer

```bash
python -m http.server 8138 --directory envies-de-voyage
```

Puis <http://localhost:8138/>. Un simple serveur de fichiers suffit ; il n'y a
rien à compiler. Le service worker (mode hors ligne) exige `http://localhost`
ou `https://`.

---

## Organisation

```
index.html              structure complète de l'interface
confidentialite.html    politique de confidentialité
manifest.webmanifest    déclaration PWA
sw.js                   cache hors ligne de l'application
css/app.css             feuille unique — la mise en page bascule par média
css/page.css            pages de texte hors application
js/categories.js        les 33 symboles, dessinés en SVG dans le fichier
js/store.js             IndexedDB : poi, photos, circuits, réglages, corbeille
js/photos.js            lecture, réduction, vignette
js/zip.js               écriture et lecture d'archives ZIP
js/exif.js              lecture des métadonnées (repris de l'Atelier Photos)
js/app.js               état partagé, carte, épingles, recherche, position
js/fiches.js            liste, fiche, éditeur, galerie, visionneuse
js/circuits.js          circuits, tracé, optimisation, GPX
js/reglages.js          réglages, sauvegarde, restauration
js/demarrage.js         câblage et mise en route
docs/planche-symboles.html   planche de contrôle des 33 symboles
docs/generer-icones.py       régénère les icônes PWA
```

---

## Choix de conception

**Le carnet ne quitte pas l'appareil.** Ni compte, ni serveur, ni mesure
d'audience. Trois choses seulement sortent : les tuiles du fond de carte, le
texte de la recherche de lieu *lorsqu'on demande explicitement* de chercher une
adresse, et les liens d'itinéraire qu'on ouvre soi-même. Le revers est assumé :
vider les données du navigateur efface le carnet — d'où l'export d'archive.

**Les photos sont réduites à l'entrée, jamais après.** Une photo de téléphone
pèse de 3 à 12 Mo ; dix par fiche et cinquante fiches dépassent le quota du
navigateur. Le rééchantillonnage se fait dans la page, avant l'écriture en base.
Effet secondaire voulu : le réencodage ne recopie aucune métadonnée, donc la
copie conservée ne contient plus ni coordonnées GPS ni numéro de série
d'appareil. Ces informations sont lues *avant* la réduction, uniquement pour
proposer de placer le point et de dater la visite. L'original n'est pas touché.

**L'éditeur n'a pas de bouton « Enregistrer ».** Chaque champ est écrit dès
qu'il perd le focus. Sur un téléphone, un formulaire à valider est un formulaire
qu'on perd.

**Les symboles sont dessinés ici, en SVG.** Pas de police d'icônes (une
dépendance de plus), pas d'émojis (dessinés différemment sous Windows et sous
Android, alors qu'une épingle doit se reconnaître à la même forme sur les deux).

**L'archive de sauvegarde est lisible sans l'application** : `carnet.json` en
texte clair, `photos/` en JPEG. Un carnet de repérage se garde des années, et
rien ne dit que le logiciel qui l'a produit sera encore là.

**Rien ne circule entre les appareils tout seul** — c'est la contrepartie de
l'absence de serveur. Le passage se fait par l'archive, et la restauration
« Réunir » compare les dates enregistrement par enregistrement : la version la
plus récemment modifiée l'emporte, dans les deux sens. Les suppressions
voyagent aussi, via un magasin `corbeille` qui ne retient qu'un identifiant et
une date : sans lui, une fiche effacée sur le téléphone reviendrait à chaque
échange avec l'ordinateur, qui l'aurait encore. Une suppression perd contre une
retouche postérieure — on a manifestement changé d'avis depuis. L'arbitrage
repose sur l'horloge de chaque appareil ; le bilan affiché après la fusion dit
combien de fiches ont été ajoutées, mises à jour, écartées ou supprimées.

**Les distances annoncées sont à vol d'oiseau, et le disent.** Calculer une
route réelle demanderait un service extérieur interrogé à chaque modification,
et une application qui ne fonctionnerait plus hors ligne. Pour la route, le
bouton « Itinéraire » passe la main à l'application de navigation.

---

## Vérification

Les 33 symboles se contrôlent dans `docs/planche-symboles.html` (ajouter
`?loupe` à l'adresse pour les voir à 96 px).

La recette fonctionnelle a couvert, sous Chrome (75 contrôles) : pose d'un point
par pointage, autosauvegarde des champs, lecture EXIF, réduction aux trois
profils (1075 Ko → 77 Ko en profil équilibré), absence de GPS dans la copie
enregistrée, plafond de dix photos, tracé et optimisation de circuit, GPX bien
formé et échappé, aller-retour d'archive ZIP octet pour octet, restauration par
l'interface, géolocalisation et tri par distance, filtres, et suppression en
cascade (photos et étapes de circuit).

La fusion a sa propre recette, scénario par scénario : ajout, archive plus
récente, archive plus ancienne, suppression distante appliquée, suppression
distante perdant contre une retouche locale, suppression locale tenant contre
une archive ancienne, fiche rétablie parce que retouchée ailleurs après son
effacement, photos d'une fiche supprimée qui ne reviennent pas orphelines,
idempotence d'une double fusion, lecture d'une archive de format 1, nettoyage
des orphelins, et un aller-retour complet entre deux appareils.

La migration de la base version 1 → 2 est vérifiée séparément : fiches, photos,
circuits et réglages écrits par la version précédente sont relus intacts, la
corbeille est créée vide, et les photos dépourvues de champ `modifie` se
comparent sur leur date d'ajout.

---

## Crédits

- Fond de carte : [OpenFreeMap](https://openfreemap.org) © OpenMapTiles —
  données © contributeurs OpenStreetMap (ODbL)
- Recherche de lieux : [Nominatim](https://nominatim.openstreetmap.org) ©
  contributeurs OpenStreetMap (ODbL)
- Cartographie : [Leaflet](https://leafletjs.com) et
  [MapLibre GL](https://maplibre.org), embarqués dans `vendor/`

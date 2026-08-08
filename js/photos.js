'use strict';
/*
 * Transfert des photographies : lecture, réduction, vignette.
 *
 * Une photo de téléphone pèse aujourd'hui entre 3 et 12 Mo. Dix photos par
 * fiche, cinquante fiches, et le carnet dépasse le quota du navigateur. Toutes
 * les images sont donc rééchantillonnées à l'entrée, avant d'atteindre la
 * base : ce qui est conservé est la version réduite, jamais l'original.
 *
 * Effet de bord voulu : le réencodage par le canevas ne recopie aucun bloc de
 * métadonnées. La photo enregistrée ne contient donc plus ni coordonnées GPS,
 * ni numéro de série d'appareil, ni nom d'auteur. Ces informations sont lues
 * *avant* la réduction, uniquement pour proposer de placer le POI sur la carte
 * et de dater la visite — et elles ne sont pas conservées.
 *
 * Tout se passe dans la page : aucun fichier n'est téléversé où que ce soit.
 */
(function (racine) {

  const PROFILS = {
    economie: { nom: 'Économe', cote: 1024, qualite: 0.70, aide: 'la plus légère — idéale sur téléphone' },
    equilibre: { nom: 'Équilibré', cote: 1600, qualite: 0.80, aide: 'bon compromis, recommandé' },
    qualite: { nom: 'Qualité', cote: 2400, qualite: 0.87, aide: 'pour revoir le détail d\'une façade' }
  };
  const VIGNETTE = { cote: 480, qualite: 0.74 };
  const MAX_PAR_POI = 10;

  /* ---------- Décodage ----------
   * `imageOrientation: 'from-image'` applique la rotation notée dans l'EXIF.
   * Sans elle, les photos prises en portrait ressortent couchées : le capteur
   * enregistre toujours dans le même sens, c'est une balise qui dit comment
   * les redresser. Certains navigateurs anciens ignorent l'option — d'où le
   * repli sur <img>, dont le comportement par défaut est le même. */
  function decoder(fichier) {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(fichier, { imageOrientation: 'from-image' })
        .catch(() => decoderViaImg(fichier));
    }
    return decoderViaImg(fichier);
  }

  function decoderViaImg(fichier) {
    return new Promise((resoudre, rejeter) => {
      const url = URL.createObjectURL(fichier);
      const im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); resoudre(im); };
      im.onerror = () => {
        URL.revokeObjectURL(url);
        rejeter(new Error('image illisible'));
      };
      im.src = url;
    });
  }

  function dimensionsCibles(l, h, cote) {
    const grand = Math.max(l, h);
    /* Une image déjà plus petite que la cible n'est pas agrandie : cela
     * n'ajouterait aucun détail et alourdirait le fichier. */
    if (grand <= cote) return { l: l, h: h, reduite: false };
    const f = cote / grand;
    return { l: Math.round(l * f), h: Math.round(h * f), reduite: true };
  }

  function dessiner(source, l, h) {
    const c = document.createElement('canvas');
    c.width = l; c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, l, h);
    return c;
  }

  function versBlob(canevas, qualite) {
    return new Promise((resoudre, rejeter) => {
      canevas.toBlob((b) => (b ? resoudre(b) : rejeter(new Error('encodage impossible'))),
        'image/jpeg', qualite);
    });
  }

  /* ---------- Métadonnées ----------
   * Seul le début du fichier est lu : le segment EXIF d'un JPEG s'y trouve, et
   * charger 12 Mo en mémoire pour y prendre deux coordonnées serait absurde. */
  function metadonnees(fichier) {
    if (!racine.EXIF) return Promise.resolve(null);
    return fichier.slice(0, Math.min(fichier.size, 1024 * 1024)).arrayBuffer()
      .then((buf) => {
        const m = racine.EXIF.lire(buf, fichier.name);
        return {
          format: m.format,
          lisible: m.pris,
          message: m.message,
          gps: m.gps ? { lat: m.gps.lat, lon: m.gps.lon } : null,
          prise: m.prise ? m.prise.iso : null
        };
      })
      .catch(() => null);
  }

  /* ---------- Traitement d'un fichier ---------- */
  function traiter(fichier, profilCle) {
    const p = PROFILS[profilCle] || PROFILS.equilibre;
    if (!/^image\//.test(fichier.type) && !/\.(jpe?g|png|webp|gif|avif)$/i.test(fichier.name)) {
      return Promise.reject(new Error('« ' + fichier.name +' » n\'est pas une image.'));
    }
    return metadonnees(fichier).then((meta) => {
      if (meta && meta.format === 'HEIC') {
        throw new Error('« ' + fichier.name + ' » est au format HEIC : aucun navigateur ne sait ' +
          'l\'afficher. Réglez l\'iPhone sur « Le plus compatible » (JPEG), ou convertissez la photo.');
      }
      return decoder(fichier).then((src) => {
        const l0 = src.width || src.naturalWidth;
        const h0 = src.height || src.naturalHeight;
        if (!l0 || !h0) throw new Error('« ' + fichier.name + ' » est illisible.');
        const d = dimensionsCibles(l0, h0, p.cote);
        const v = dimensionsCibles(l0, h0, VIGNETTE.cote);
        return Promise.all([
          versBlob(dessiner(src, d.l, d.h), p.qualite),
          versBlob(dessiner(src, v.l, v.h), VIGNETTE.qualite)
        ]).then((b) => {
          if (src.close) src.close();
          return {
            image: b[0], vignette: b[1],
            largeur: d.l, hauteur: d.h,
            poids: b[0].size, poidsOrigine: fichier.size,
            largeurOrigine: l0, hauteurOrigine: h0,
            nomOrigine: fichier.name,
            profil: p === PROFILS.economie ? 'economie' : (p === PROFILS.qualite ? 'qualite' : 'equilibre'),
            gps: meta ? meta.gps : null,
            prise: meta ? meta.prise : null
          };
        });
      });
    });
  }

  /* Traitement en file, un fichier à la fois : décoder cinq images de 12 Mo en
   * parallèle fait tomber l'onglet sur un téléphone. `progres` reçoit
   * (fait, total, nomEnCours). */
  function traiterPlusieurs(fichiers, profil, progres) {
    const liste = Array.prototype.slice.call(fichiers);
    const resultats = [];
    const erreurs = [];
    let i = 0;
    function suite() {
      if (i >= liste.length) return Promise.resolve({ resultats: resultats, erreurs: erreurs });
      const f = liste[i];
      if (progres) progres(i, liste.length, f.name);
      return traiter(f, profil)
        .then((r) => { resultats.push(r); })
        .catch((e) => { erreurs.push({ nom: f.name, message: e.message }); })
        .then(() => { i++; return suite(); });
    }
    return suite();
  }

  function formaterPoids(o) {
    if (o == null) return '—';
    if (o < 1024) return o + ' o';
    if (o < 1024 * 1024) return (o / 1024).toFixed(0) + ' Ko';
    if (o < 1024 * 1024 * 1024) return (o / (1024 * 1024)).toFixed(1) + ' Mo';
    /* Le quota annoncé par le navigateur se compte en gigaoctets : l'écrire en
     * mégaoctets donnerait « 10244,3 Mo », que personne ne lit. */
    return (o / (1024 * 1024 * 1024)).toFixed(1) + ' Go';
  }

  racine.PHOTOS = {
    PROFILS: PROFILS, MAX_PAR_POI: MAX_PAR_POI,
    traiter: traiter, traiterPlusieurs: traiterPlusieurs,
    metadonnees: metadonnees, formaterPoids: formaterPoids
  };

})(typeof self !== 'undefined' ? self : this);

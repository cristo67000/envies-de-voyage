'use strict';
/*
 * Lecture des métadonnées d'image — parseur autonome, aucune dépendance.
 *
 * Couvre les conteneurs que produisent les appareils visés (téléphone Android
 * et appareil photo) : JPEG (segment APP1 « Exif\0\0 »), plus WebP (chunk EXIF)
 * et PNG (chunk eXIf) pour les fichiers déjà retravaillés. Le HEIC des iPhone
 * n'est PAS pris en charge : son EXIF est lisible mais aucun navigateur sous
 * Windows ne sait décoder l'image elle-même, la conversion serait donc
 * impossible ensuite. Le format est détecté et signalé explicitement plutôt que
 * de laisser croire à une lecture partielle.
 *
 * Rien n'est jamais évalué : le fichier est lu octet par octet dans un
 * DataView. Aucune donnée ne quitte la machine.
 *
 * Utilisable sans DOM (testable sous Node avec un ArrayBuffer).
 */
(function (racine) {

  /* ---------- Types TIFF ---------- */
  const TAILLE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

  /* ---------- Tables de tags ----------
   * Volontairement partielles : seuls les tags qui servent au positionnement,
   * à la datation, à l'identification du matériel ou à la confidentialité. Les
   * autres sont conservés en brut sous leur code hexadécimal. */
  const TAGS_IFD = {
    0x010e: 'ImageDescription', 0x010f: 'Make', 0x0110: 'Model',
    0x0112: 'Orientation', 0x011a: 'XResolution', 0x011b: 'YResolution',
    0x0128: 'ResolutionUnit', 0x0131: 'Software', 0x0132: 'DateTime',
    0x013b: 'Artist', 0x013c: 'HostComputer', 0x8298: 'Copyright',
    0x0100: 'ImageWidth', 0x0101: 'ImageLength',
    0x8769: 'ExifIFD', 0x8825: 'GPSIFD'
  };
  const TAGS_EXIF = {
    0x829a: 'ExposureTime', 0x829d: 'FNumber', 0x8822: 'ExposureProgram',
    0x8827: 'ISOSpeedRatings', 0x9003: 'DateTimeOriginal',
    0x9004: 'DateTimeDigitized', 0x9010: 'OffsetTime',
    0x9011: 'OffsetTimeOriginal', 0x9201: 'ShutterSpeedValue',
    0x9202: 'ApertureValue', 0x9204: 'ExposureBiasValue',
    0x9205: 'MaxApertureValue', 0x9207: 'MeteringMode', 0x9208: 'LightSource',
    0x9209: 'Flash', 0x920a: 'FocalLength', 0x927c: 'MakerNote',
    0x9286: 'UserComment', 0xa002: 'PixelXDimension', 0xa003: 'PixelYDimension',
    0xa005: 'InteropIFD', 0xa402: 'ExposureMode', 0xa403: 'WhiteBalance',
    0xa405: 'FocalLengthIn35mmFilm', 0xa406: 'SceneCaptureType',
    0xa430: 'CameraOwnerName', 0xa431: 'BodySerialNumber',
    0xa432: 'LensSpecification', 0xa433: 'LensMake', 0xa434: 'LensModel',
    0xa435: 'LensSerialNumber', 0xa420: 'ImageUniqueID'
  };
  const TAGS_GPS = {
    0x0000: 'GPSVersionID', 0x0001: 'GPSLatitudeRef', 0x0002: 'GPSLatitude',
    0x0003: 'GPSLongitudeRef', 0x0004: 'GPSLongitude', 0x0005: 'GPSAltitudeRef',
    0x0006: 'GPSAltitude', 0x0007: 'GPSTimeStamp', 0x0008: 'GPSSatellites',
    0x0009: 'GPSStatus', 0x000a: 'GPSMeasureMode', 0x000b: 'GPSDOP',
    0x000c: 'GPSSpeedRef', 0x000d: 'GPSSpeed', 0x000e: 'GPSTrackRef',
    0x000f: 'GPSTrack', 0x0010: 'GPSImgDirectionRef', 0x0011: 'GPSImgDirection',
    0x0012: 'GPSMapDatum', 0x001d: 'GPSDateStamp', 0x001f: 'GPSHPositioningError'
  };

  /* Tags dont la présence dans un fichier PUBLIÉ poserait un problème :
   * position exacte, identité de l'auteur, numéro de série traçable. */
  const SENSIBLES = {
    GPSLatitude: 'position exacte de la prise de vue',
    GPSLongitude: 'position exacte de la prise de vue',
    GPSAltitude: 'altitude de la prise de vue',
    GPSTimeStamp: 'heure exacte de la prise de vue',
    GPSDateStamp: 'date exacte de la prise de vue',
    Artist: 'nom de l\'auteur',
    Copyright: 'mention de droits',
    CameraOwnerName: 'nom du propriétaire de l\'appareil',
    BodySerialNumber: 'numéro de série du boîtier — traçable',
    LensSerialNumber: 'numéro de série de l\'objectif — traçable',
    ImageUniqueID: 'identifiant unique de cliché',
    UserComment: 'commentaire libre',
    ImageDescription: 'description libre',
    HostComputer: 'machine ayant traité le fichier',
    MakerNote: 'bloc constructeur (contenu opaque, souvent volumineux)'
  };

  /* ---------- Lecture d'une valeur d'entrée IFD ---------- */
  function lireValeur(dv, debut, type, nombre, gros) {
    const t = TAILLE[type];
    if (!t) return null;
    const total = t * nombre;
    let p = debut;
    if (total > 4) {
      p = dv.getUint32(debut, !gros) + lireValeur.base;
      if (p + total > dv.byteLength || p < 0) return null;
    }
    if (type === 2) {                       /* ASCII */
      let s = '';
      for (let i = 0; i < nombre; i++) {
        const c = dv.getUint8(p + i);
        if (c === 0) break;
        s += String.fromCharCode(c);
      }
      return s.trim();
    }
    if (type === 7 || type === 1 || type === 6) {   /* UNDEFINED / BYTE */
      const o = [];
      for (let i = 0; i < Math.min(nombre, 64); i++) o.push(dv.getUint8(p + i));
      return { octets: o, longueur: nombre };
    }
    const v = [];
    for (let i = 0; i < nombre; i++) {
      const q = p + i * t;
      if (q + t > dv.byteLength) return null;
      switch (type) {
        case 3: v.push(dv.getUint16(q, !gros)); break;
        case 4: v.push(dv.getUint32(q, !gros)); break;
        case 8: v.push(dv.getInt16(q, !gros)); break;
        case 9: v.push(dv.getInt32(q, !gros)); break;
        case 11: v.push(dv.getFloat32(q, !gros)); break;
        case 12: v.push(dv.getFloat64(q, !gros)); break;
        case 5: {
          const n = dv.getUint32(q, !gros), d = dv.getUint32(q + 4, !gros);
          v.push(d === 0 ? 0 : n / d);
          break;
        }
        case 10: {
          const n = dv.getInt32(q, !gros), d = dv.getInt32(q + 4, !gros);
          v.push(d === 0 ? 0 : n / d);
          break;
        }
        default: return null;
      }
    }
    return nombre === 1 ? v[0] : v;
  }

  /* ---------- Parcours d'un IFD ----------
   * `vus` empêche une boucle infinie sur un fichier corrompu dont un pointeur
   * de sous-IFD renverrait vers un offset déjà visité. */
  function lireIFD(dv, base, offset, gros, table, sortie, vus, sousIFD) {
    if (vus.has(offset) || offset <= 0 || base + offset + 2 > dv.byteLength) return;
    vus.add(offset);
    const p0 = base + offset;
    const n = dv.getUint16(p0, !gros);
    /* Un IFD plausible ne dépasse pas quelques centaines d'entrées. */
    if (n > 512 || p0 + 2 + n * 12 > dv.byteLength) return;
    lireValeur.base = base;
    for (let i = 0; i < n; i++) {
      const e = p0 + 2 + i * 12;
      const tag = dv.getUint16(e, !gros);
      const type = dv.getUint16(e + 2, !gros);
      const nombre = dv.getUint32(e + 4, !gros);
      if (nombre > 100000) continue;
      const nom = table[tag] || ('0x' + tag.toString(16).padStart(4, '0'));
      const val = lireValeur(dv, e + 8, type, nombre, gros);
      if (val === null) continue;
      if (nom === 'ExifIFD' || nom === 'GPSIFD' || nom === 'InteropIFD') {
        sousIFD.push({ nom: nom, offset: Array.isArray(val) ? val[0] : val });
        continue;
      }
      sortie[nom] = val;
    }
  }

  /* ---------- Bloc TIFF complet (contenu d'un APP1 sans son en-tête) ---------- */
  function lireTIFF(dv, base) {
    if (base + 8 > dv.byteLength) return null;
    const ordre = dv.getUint16(base, false);
    if (ordre !== 0x4949 && ordre !== 0x4d4d) return null;
    const gros = ordre === 0x4d4d;
    if (dv.getUint16(base + 2, !gros) !== 0x002a) return null;
    const off0 = dv.getUint32(base + 4, !gros);

    const ifd0 = {}, exif = {}, gps = {};
    const vus = new Set();
    const sous = [];
    lireIFD(dv, base, off0, gros, TAGS_IFD, ifd0, vus, sous);
    sous.forEach((s) => {
      if (s.nom === 'ExifIFD') lireIFD(dv, base, s.offset, gros, TAGS_EXIF, exif, vus, []);
      if (s.nom === 'GPSIFD') lireIFD(dv, base, s.offset, gros, TAGS_GPS, gps, vus, []);
    });
    return { ifd0: ifd0, exif: exif, gps: gps, gros: gros };
  }

  /* ---------- Conteneurs ---------- */

  /* JPEG : parcours des segments.
   *
   * `octets` ne compte QUE les porteurs de données descriptives ou
   * personnelles — EXIF, XMP, IPTC, commentaires. Le profil colorimétrique ICC
   * et l'en-tête JFIF en sont exclus à dessein : ils ne disent rien de vous, et
   * l'ICC est même souhaitable, c'est lui qui garantit que les couleurs de la
   * photo s'affichent comme elles ont été prises. Les confondre reviendrait à
   * bloquer une image parfaitement propre au motif qu'elle sait rendre ses
   * couleurs. */
  function lireJPEG(dv) {
    if (dv.byteLength < 4 || dv.getUint16(0, false) !== 0xffd8) return null;
    let p = 2, tiff = null, xmp = false, iptc = false, icc = false;
    let octets = 0, octetsTechniques = 0;
    while (p + 4 <= dv.byteLength) {
      if (dv.getUint8(p) !== 0xff) { p++; continue; }
      const marqueur = dv.getUint8(p + 1);
      if (marqueur === 0xd8 || marqueur === 0x01 || (marqueur >= 0xd0 && marqueur <= 0xd7)) { p += 2; continue; }
      if (marqueur === 0xda || marqueur === 0xd9) break;     /* début des données image */
      const taille = dv.getUint16(p + 2, false);
      if (taille < 2 || p + 2 + taille > dv.byteLength) break;
      const corps = p + 4;
      const poids = taille + 2;
      let descriptif = false;

      if (marqueur === 0xe1) {
        const entete = chaine(dv, corps, 6);
        if (entete === 'Exif\0\0') { descriptif = true; if (!tiff) tiff = lireTIFF(dv, corps + 6); }
        if (chaine(dv, corps, 28).indexOf('http://ns.adobe.com/xap') === 0) { xmp = true; descriptif = true; }
      } else if (marqueur === 0xed) {
        iptc = true; descriptif = true;               /* bloc Photoshop / IPTC */
      } else if (marqueur === 0xfe) {
        descriptif = true;                            /* commentaire libre */
      } else if (marqueur === 0xe2 && chaine(dv, corps, 11) === 'ICC_PROFILE') {
        icc = true;
      }

      if (descriptif) octets += poids;
      else if (marqueur >= 0xe0 && marqueur <= 0xef) octetsTechniques += poids;
      p += 2 + taille;
    }
    return {
      tiff: tiff, xmp: xmp, iptc: iptc, icc: icc,
      octets: octets, octetsTechniques: octetsTechniques
    };
  }

  /* WebP : conteneur RIFF, chunk « EXIF ». */
  function lireWEBP(dv) {
    if (dv.byteLength < 16) return null;
    if (chaine(dv, 0, 4) !== 'RIFF' || chaine(dv, 8, 4) !== 'WEBP') return null;
    let p = 12, tiff = null, xmp = false, icc = false, octets = 0, octetsTechniques = 0;
    while (p + 8 <= dv.byteLength) {
      const nom = chaine(dv, p, 4);
      const taille = dv.getUint32(p + 4, true);
      if (taille < 0 || p + 8 + taille > dv.byteLength) break;
      if (nom === 'EXIF') {
        octets += taille + 8;
        /* Certains encodeurs préfixent le TIFF par « Exif\0\0 », d'autres non. */
        const decalage = chaine(dv, p + 8, 6) === 'Exif\0\0' ? 6 : 0;
        tiff = lireTIFF(dv, p + 8 + decalage);
      }
      if (nom === 'XMP ') { xmp = true; octets += taille + 8; }
      if (nom === 'ICCP') { icc = true; octetsTechniques += taille + 8; }
      p += 8 + taille + (taille % 2);
    }
    return {
      tiff: tiff, xmp: xmp, iptc: false, icc: icc,
      octets: octets, octetsTechniques: octetsTechniques
    };
  }

  /* PNG : chunk « eXIf » (rare, mais certains exports en produisent). */
  function lirePNG(dv) {
    if (dv.byteLength < 8) return null;
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) if (dv.getUint8(i) !== sig[i]) return null;
    let p = 8, tiff = null, xmp = false, icc = false, octets = 0, octetsTechniques = 0;
    while (p + 8 <= dv.byteLength) {
      const taille = dv.getUint32(p, false);
      const nom = chaine(dv, p + 4, 4);
      if (p + 12 + taille > dv.byteLength) break;
      if (nom === 'eXIf') { octets += taille + 12; tiff = lireTIFF(dv, p + 8); }
      if (nom === 'iTXt' || nom === 'tEXt' || nom === 'zTXt') { octets += taille + 12; xmp = true; }
      if (nom === 'iCCP') { icc = true; octetsTechniques += taille + 12; }
      if (nom === 'IEND') break;
      p += 12 + taille;
    }
    return {
      tiff: tiff, xmp: xmp, iptc: false, icc: icc,
      octets: octets, octetsTechniques: octetsTechniques
    };
  }

  function chaine(dv, p, n) {
    let s = '';
    for (let i = 0; i < n && p + i < dv.byteLength; i++) s += String.fromCharCode(dv.getUint8(p + i));
    return s;
  }

  /* ---------- Conversions ---------- */

  /* Degrés/minutes/secondes → degrés décimaux. Une valeur hors bornes est
   * refusée plutôt que ramenée de force : mieux vaut « pas de position » qu'une
   * position fausse. */
  function versDecimal(dms, ref) {
    if (!Array.isArray(dms) || dms.length < 2) return null;
    const d = Number(dms[0]) || 0, m = Number(dms[1]) || 0, s = Number(dms[2]) || 0;
    let v = d + m / 60 + s / 3600;
    if (!isFinite(v)) return null;
    const r = String(ref || '').toUpperCase();
    if (r === 'S' || r === 'W') v = -v;
    return v;
  }

  /* « 2026:07:14 18:32:05 » → objet exploitable. Le format EXIF n'a pas de
   * fuseau : OffsetTimeOriginal le donne quand l'appareil le renseigne. */
  function versDate(txt, decalage) {
    if (typeof txt !== 'string') return null;
    const m = txt.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    if (!m) return null;
    return {
      iso: m[1] + '-' + m[2] + '-' + m[3],
      heure: m[4] + ':' + m[5] + ':' + m[6],
      annee: Number(m[1]),
      decalage: decalage || null,
      lisible: m[3] + '/' + m[2] + '/' + m[1] + ' à ' + m[4] + ':' + m[5]
    };
  }

  const ORIENTATIONS = {
    1: 'normale', 2: 'miroir horizontal', 3: 'rotation 180°',
    4: 'miroir vertical', 5: 'miroir + rotation 90° horaire',
    6: 'rotation 90° horaire', 7: 'miroir + rotation 90° antihoraire',
    8: 'rotation 90° antihoraire'
  };

  /* ---------- Point d'entrée ---------- */
  function lire(buffer, nomFichier) {
    const dv = new DataView(buffer);
    let format = 'inconnu', brut = null;

    if (dv.byteLength >= 12 && chaine(dv, 4, 4) === 'ftyp') {
      const marque = chaine(dv, 8, 4);
      if (['heic', 'heix', 'hevc', 'mif1', 'heim', 'msf1'].indexOf(marque) !== -1) {
        return {
          format: 'HEIC',
          pris: false,
          message: 'Fichier HEIC (iPhone/iPad). Les métadonnées y sont bien présentes, ' +
            'mais aucun navigateur sous Windows ne sait décoder l\'image : la conversion ' +
            'serait impossible. Réglez l\'appareil sur « Le plus compatible » (JPEG), ou ' +
            'convertissez le fichier avant de le déposer ici.',
          tags: {}, gps: null, prise: null, appareil: {}, confidentialite: [],
          octets: 0, octetsTechniques: 0
        };
      }
    }

    if (dv.byteLength >= 3 && dv.getUint8(0) === 0xff && dv.getUint8(1) === 0xd8) {
      format = 'JPEG'; brut = lireJPEG(dv);
    } else if (chaine(dv, 0, 4) === 'RIFF') {
      format = 'WebP'; brut = lireWEBP(dv);
    } else if (dv.byteLength >= 8 && dv.getUint8(0) === 137 && dv.getUint8(1) === 80) {
      format = 'PNG'; brut = lirePNG(dv);
    }

    if (!brut) {
      return {
        format: format, pris: false,
        message: 'Format non reconnu' + (nomFichier ? ' (' + nomFichier + ')' : '') +
          '. L\'atelier lit le JPEG, le WebP et le PNG.',
        tags: {}, gps: null, prise: null, appareil: {}, confidentialite: [],
        octets: 0, octetsTechniques: 0
      };
    }

    const t = brut.tiff || { ifd0: {}, exif: {}, gps: {} };
    const tags = Object.assign({}, t.ifd0, t.exif, t.gps);

    /* --- Position --- */
    let gps = null;
    const lat = versDecimal(t.gps.GPSLatitude, t.gps.GPSLatitudeRef);
    const lon = versDecimal(t.gps.GPSLongitude, t.gps.GPSLongitudeRef);
    if (lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 &&
        !(lat === 0 && lon === 0)) {
      let alt = null;
      if (typeof t.gps.GPSAltitude === 'number') {
        alt = t.gps.GPSAltitude;
        /* GPSAltitudeRef = 1 signifie « sous le niveau de la mer ». */
        if (t.gps.GPSAltitudeRef === 1 || (t.gps.GPSAltitudeRef && t.gps.GPSAltitudeRef.octets &&
            t.gps.GPSAltitudeRef.octets[0] === 1)) alt = -alt;
      }
      gps = {
        lat: lat, lon: lon, alt: alt,
        direction: typeof t.gps.GPSImgDirection === 'number' ? t.gps.GPSImgDirection : null,
        directionRef: t.gps.GPSImgDirectionRef === 'M' ? 'magnétique' : 'géographique',
        precision: typeof t.gps.GPSHPositioningError === 'number' ? t.gps.GPSHPositioningError : null,
        dop: typeof t.gps.GPSDOP === 'number' ? t.gps.GPSDOP : null,
        datum: t.gps.GPSMapDatum || null,
        mode: t.gps.GPSMeasureMode === '3' ? '3D' : (t.gps.GPSMeasureMode === '2' ? '2D' : null),
        satellites: t.gps.GPSSatellites || null
      };
    }

    /* --- Prise de vue --- */
    const prise = versDate(t.exif.DateTimeOriginal || t.exif.DateTimeDigitized || t.ifd0.DateTime,
      t.exif.OffsetTimeOriginal || t.exif.OffsetTime);

    /* --- Matériel et réglages --- */
    const nb = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
    const appareil = {
      marque: t.ifd0.Make || null,
      modele: t.ifd0.Model || null,
      objectif: t.exif.LensModel || null,
      focale: nb(t.exif.FocalLength),
      focale35: nb(t.exif.FocalLengthIn35mmFilm),
      ouverture: nb(t.exif.FNumber),
      pose: nb(t.exif.ExposureTime),
      iso: Array.isArray(t.exif.ISOSpeedRatings) ? t.exif.ISOSpeedRatings[0] : nb(t.exif.ISOSpeedRatings),
      flash: typeof t.exif.Flash === 'number' ? (t.exif.Flash & 1) === 1 : null,
      logiciel: t.ifd0.Software || null
    };

    /* --- Dimensions et orientation --- */
    const orientation = nb(t.ifd0.Orientation) || 1;
    const largeur = nb(t.exif.PixelXDimension) || nb(t.ifd0.ImageWidth) || null;
    const hauteur = nb(t.exif.PixelYDimension) || nb(t.ifd0.ImageLength) || null;

    /* --- Ce qui devra disparaître du fichier publié --- */
    const confidentialite = [];
    Object.keys(SENSIBLES).forEach((k) => {
      if (tags[k] === undefined || tags[k] === null || tags[k] === '') return;
      confidentialite.push({ tag: k, quoi: SENSIBLES[k] });
    });
    if (brut.xmp) confidentialite.push({ tag: 'XMP', quoi: 'bloc XMP (auteur, mots-clés, historique de retouche)' });
    if (brut.iptc) confidentialite.push({ tag: 'IPTC', quoi: 'bloc IPTC (légende, crédit, contact)' });

    /* Un appareil aérien se reconnaît à sa marque : la question du survol ne
     * sera posée que dans ce cas. */
    const marque = String(appareil.marque || '').toLowerCase();
    const modele = String(appareil.modele || '').toLowerCase();
    const aerien = /dji|autel|parrot|skydio|yuneec/.test(marque) ||
      /mavic|phantom|air 2|air 3|mini [234]|inspire|avata|anafi/.test(modele);

    return {
      format: format, pris: true, message: null,
      tags: tags, gps: gps, prise: prise, appareil: appareil,
      orientation: orientation,
      orientationTexte: ORIENTATIONS[orientation] || ('code ' + orientation),
      largeur: largeur, hauteur: hauteur,
      aerien: aerien,
      xmp: brut.xmp, iptc: brut.iptc, icc: brut.icc,
      octets: brut.octets,
      octetsTechniques: brut.octetsTechniques || 0,
      confidentialite: confidentialite
    };
  }

  const API = { lire: lire, ORIENTATIONS: ORIENTATIONS, SENSIBLES: SENSIBLES };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else racine.EXIF = API;

})(typeof self !== 'undefined' ? self : this);

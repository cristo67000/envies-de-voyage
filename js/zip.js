'use strict';
/*
 * Écriture et lecture d'archives ZIP — sauvegarde du carnet.
 *
 * Pourquoi une archive et pas un simple JSON : les photographies sont des
 * données binaires. Les glisser dans du JSON impose l'encodage base64, qui les
 * gonfle d'un tiers et produit un fichier de plusieurs dizaines de méga-octets
 * qu'aucun éditeur n'ouvre. Une archive contient le carnet en JSON lisible
 * d'un côté, les photos en JPEG de l'autre — récupérables une par une, même
 * sans cette application.
 *
 * À l'écriture, les entrées sont stockées telles quelles (méthode 0, sans
 * compression) : un JPEG est déjà compressé, le deflater une seconde fois
 * coûte du temps et ne gagne rien. À la lecture, la méthode 8 (deflate) est
 * acceptée aussi — une archive réenregistrée par un utilitaire du système
 * doit pouvoir être relue.
 */
(function (racine) {

  /* ---------- CRC-32 (polynôme 0xEDB88320) ---------- */
  const TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(u8) {
    let c = 0xffffffff;
    for (let i = 0; i < u8.length; i++) c = TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /* ---------- Petits utilitaires binaires ---------- */
  function u8(nom) { return new TextEncoder().encode(nom); }

  function ecrire(vue, pos, valeurs) {
    valeurs.forEach((v) => {
      if (v.t === 2) { vue.setUint16(pos, v.v, true); pos += 2; }
      else { vue.setUint32(pos, v.v >>> 0, true); pos += 4; }
    });
    return pos;
  }

  /* Date/heure au format MS-DOS, seule datation que connaisse le format. */
  function horodatage(d) {
    const an = Math.max(1980, d.getFullYear());
    return {
      heure: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      date: ((an - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
    };
  }

  function versOctets(donnees) {
    if (donnees instanceof Uint8Array) return Promise.resolve(donnees);
    if (typeof donnees === 'string') return Promise.resolve(u8(donnees));
    if (donnees instanceof ArrayBuffer) return Promise.resolve(new Uint8Array(donnees));
    return donnees.arrayBuffer().then((b) => new Uint8Array(b));
  }

  /* ---------- Écriture ----------
   * `entrees` : [{ nom, donnees: Blob | Uint8Array | string }] */
  function creer(entrees) {
    const parties = [];
    const central = [];
    const quand = horodatage(new Date());
    let decalage = 0;
    let i = 0;

    function suivante() {
      if (i >= entrees.length) return Promise.resolve();
      const e = entrees[i];
      const nom = u8(e.nom);
      return versOctets(e.donnees).then((oct) => {
        const somme = crc32(oct);
        const taille = oct.length;

        const enTete = new ArrayBuffer(30 + nom.length);
        const v = new DataView(enTete);
        ecrire(v, 0, [
          { t: 4, v: 0x04034b50 }, { t: 2, v: 20 },
          { t: 2, v: 0x0800 },            /* drapeau : nom de fichier en UTF-8 */
          { t: 2, v: 0 },                 /* méthode 0 — stocké */
          { t: 2, v: quand.heure }, { t: 2, v: quand.date },
          { t: 4, v: somme }, { t: 4, v: taille }, { t: 4, v: taille },
          { t: 2, v: nom.length }, { t: 2, v: 0 }
        ]);
        new Uint8Array(enTete, 30).set(nom);

        parties.push(new Uint8Array(enTete));
        /* On repousse la donnée d'origine (souvent un Blob déjà sur disque)
         * plutôt que la copie lue : le tampon peut être libéré tout de suite. */
        parties.push(e.donnees instanceof Blob ? e.donnees : oct);

        central.push({ nom: nom, somme: somme, taille: taille, decalage: decalage });
        decalage += 30 + nom.length + taille;
        i++;
        return suivante();
      });
    }

    return suivante().then(() => {
      const debutCentral = decalage;
      let tailleCentral = 0;
      central.forEach((c) => {
        const b = new ArrayBuffer(46 + c.nom.length);
        const v = new DataView(b);
        ecrire(v, 0, [
          { t: 4, v: 0x02014b50 }, { t: 2, v: 20 }, { t: 2, v: 20 },
          { t: 2, v: 0x0800 }, { t: 2, v: 0 },
          { t: 2, v: quand.heure }, { t: 2, v: quand.date },
          { t: 4, v: c.somme }, { t: 4, v: c.taille }, { t: 4, v: c.taille },
          { t: 2, v: c.nom.length }, { t: 2, v: 0 }, { t: 2, v: 0 },
          { t: 2, v: 0 }, { t: 2, v: 0 }, { t: 4, v: 0 },
          { t: 4, v: c.decalage }
        ]);
        new Uint8Array(b, 46).set(c.nom);
        parties.push(new Uint8Array(b));
        tailleCentral += b.byteLength;
      });

      const fin = new ArrayBuffer(22);
      ecrire(new DataView(fin), 0, [
        { t: 4, v: 0x06054b50 }, { t: 2, v: 0 }, { t: 2, v: 0 },
        { t: 2, v: central.length }, { t: 2, v: central.length },
        { t: 4, v: tailleCentral }, { t: 4, v: debutCentral }, { t: 2, v: 0 }
      ]);
      parties.push(new Uint8Array(fin));

      return new Blob(parties, { type: 'application/zip' });
    });
  }

  /* ---------- Lecture ---------- */

  function degonfler(oct) {
    if (typeof DecompressionStream !== 'function') {
      return Promise.reject(new Error('Ce navigateur ne sait pas décompresser cette archive. ' +
        'Réenregistrez-la sans compression, ou utilisez un navigateur plus récent.'));
    }
    const flux = new Blob([oct]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(flux).arrayBuffer().then((b) => new Uint8Array(b));
  }

  function lire(source) {
    return versOctets(source).then((oct) => {
      const v = new DataView(oct.buffer, oct.byteOffset, oct.byteLength);

      /* Le répertoire central se trouve à la fin ; son adresse est dans le
       * bloc « fin de répertoire », qu'on cherche à rebours car il peut être
       * suivi d'un commentaire de longueur libre. */
      let fin = -1;
      for (let p = oct.length - 22; p >= 0 && p >= oct.length - 66000; p--) {
        if (v.getUint32(p, true) === 0x06054b50) { fin = p; break; }
      }
      if (fin < 0) throw new Error('Ce fichier n\'est pas une archive ZIP valide.');

      const nb = v.getUint16(fin + 10, true);
      let p = v.getUint32(fin + 16, true);
      const entrees = [];

      for (let n = 0; n < nb; n++) {
        if (p + 46 > oct.length || v.getUint32(p, true) !== 0x02014b50) break;
        const methode = v.getUint16(p + 10, true);
        const tailleComp = v.getUint32(p + 20, true);
        const tailleBrute = v.getUint32(p + 24, true);
        const lNom = v.getUint16(p + 28, true);
        const lExtra = v.getUint16(p + 30, true);
        const lComm = v.getUint16(p + 32, true);
        const local = v.getUint32(p + 42, true);
        const nom = new TextDecoder('utf-8').decode(oct.subarray(p + 46, p + 46 + lNom));
        p += 46 + lNom + lExtra + lComm;

        if (local + 30 > oct.length || v.getUint32(local, true) !== 0x04034b50) continue;
        /* Les longueurs de l'en-tête local peuvent différer de celles du
         * répertoire central : c'est celui-ci qui fait foi pour les tailles,
         * celui-là pour la position exacte des données. */
        const debut = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
        entrees.push({
          nom: nom, methode: methode,
          brut: oct.subarray(debut, debut + tailleComp),
          taille: tailleBrute
        });
      }

      let i = 0;
      const sortie = [];
      function suite() {
        if (i >= entrees.length) return Promise.resolve(sortie);
        const e = entrees[i++];
        if (e.nom.slice(-1) === '/') return suite();
        const donnees = e.methode === 0 ? Promise.resolve(e.brut)
          : (e.methode === 8 ? degonfler(e.brut)
            : Promise.reject(new Error('Compression inconnue dans « ' + e.nom + ' ».')));
        return donnees.then((d) => { sortie.push({ nom: e.nom, donnees: d }); return suite(); });
      }
      return suite();
    });
  }

  racine.ZIP = { creer: creer, lire: lire, crc32: crc32 };

})(typeof self !== 'undefined' ? self : this);

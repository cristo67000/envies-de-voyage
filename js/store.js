'use strict';
/*
 * Stockage local — IndexedDB.
 *
 * Tout reste sur l'appareil : rien n'est envoyé nulle part, il n'y a pas de
 * compte, pas de serveur. IndexedDB plutôt que localStorage parce que les
 * photographies sont conservées telles quelles, en Blob : localStorage ne
 * stocke que du texte et plafonne autour de 5 Mo, soit une poignée de photos.
 *
 * Cinq magasins :
 *   poi       — les envies et les visites
 *   photos    — un enregistrement par photo, image réduite + vignette
 *   circuits  — un ordre de POI, rien de plus
 *   reglages  — préférences d'affichage et de réduction
 *   corbeille — trace des suppressions : {id, type, quand}
 *
 * La corbeille ne sert qu'à la fusion de deux carnets. Sans elle, un point
 * effacé sur le téléphone reviendrait à chaque échange avec l'ordinateur, qui
 * l'aurait encore : la suppression est une information, au même titre que la
 * modification, et doit voyager avec le reste. Un enregistrement de corbeille
 * pèse quelques dizaines d'octets et ne contient ni nom ni coordonnées.
 */
(function (racine) {

  const NOM = 'envies-de-voyage';
  const VERSION = 2;
  let bd = null;

  function identifiant() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function ouvrir() {
    if (bd) return Promise.resolve(bd);
    return new Promise((resoudre, rejeter) => {
      const dem = indexedDB.open(NOM, VERSION);
      dem.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('poi')) {
          const s = d.createObjectStore('poi', { keyPath: 'id' });
          s.createIndex('categorie', 'categorie', { unique: false });
          s.createIndex('statut', 'statut', { unique: false });
        }
        if (!d.objectStoreNames.contains('photos')) {
          const s = d.createObjectStore('photos', { keyPath: 'id' });
          s.createIndex('poiId', 'poiId', { unique: false });
        }
        if (!d.objectStoreNames.contains('circuits')) {
          d.createObjectStore('circuits', { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains('reglages')) {
          d.createObjectStore('reglages', { keyPath: 'cle' });
        }
        /* Ajoutée en version 2 : les carnets créés avant la reçoivent vide,
         * sans rien perdre — les magasins existants ne sont pas touchés. */
        if (!d.objectStoreNames.contains('corbeille')) {
          d.createObjectStore('corbeille', { keyPath: 'id' });
        }
      };
      dem.onsuccess = () => {
        bd = dem.result;
        /* Une autre fenêtre qui demanderait une version supérieure resterait
         * bloquée tant que celle-ci garde la base ouverte. */
        bd.onversionchange = () => { bd.close(); bd = null; };
        resoudre(bd);
      };
      dem.onerror = () => rejeter(dem.error);
    });
  }

  /* Enveloppe une transaction : `travail` reçoit le magasin et renvoie
   * éventuellement une IDBRequest dont on veut le résultat. */
  function tx(magasins, mode, travail) {
    return ouvrir().then((d) => new Promise((resoudre, rejeter) => {
      const noms = Array.isArray(magasins) ? magasins : [magasins];
      const t = d.transaction(noms, mode);
      let valeur;
      const acces = {};
      noms.forEach((n) => { acces[n] = t.objectStore(n); });
      const r = travail(noms.length === 1 ? acces[noms[0]] : acces, t);
      if (r && typeof r.onsuccess !== 'undefined') r.onsuccess = () => { valeur = r.result; };
      else valeur = r;
      t.oncomplete = () => resoudre(valeur);
      t.onerror = () => rejeter(t.error);
      t.onabort = () => rejeter(t.error || new Error('transaction interrompue'));
    }));
  }

  function tout(magasin) {
    return tx(magasin, 'readonly', (s) => s.getAll());
  }

  /* ---------- POI ---------- */

  /* Gabarit d'un point d'intérêt. Les champs de visite existent dès la
   * création : une envie devient une visite sans changer de forme. */
  function poiNeuf(champs) {
    const t = new Date().toISOString();
    return Object.assign({
      id: identifiant(),
      nom: '',
      categorie: 'autre',
      lat: 0,
      lon: 0,
      adresse: '',
      notes: '',
      liens: [],
      statut: 'envie',        /* 'envie' | 'visite' */
      etoiles: 0,             /* 0 à 3 */
      avis: '',
      dateVisite: '',
      cree: t,
      modifie: t
    }, champs || {});
  }

  function poiTous() { return tout('poi'); }

  function poiLire(id) {
    return tx('poi', 'readonly', (s) => s.get(id));
  }

  function poiEnregistrer(p) {
    p.modifie = new Date().toISOString();
    return tx('poi', 'readwrite', (s) => s.put(p)).then(() => p);
  }

  /* Supprime le POI, ses photos, et son passage dans les circuits :
   * un circuit qui pointerait vers un POI disparu afficherait une étape vide.
   * Chaque suppression laisse sa trace en corbeille, y compris pour les photos
   * emportées au passage — sinon une fusion ultérieure les rétablirait
   * orphelines, rattachées à une fiche qui n'existe plus. */
  function poiSupprimer(id) {
    return tx(['poi', 'photos', 'circuits', 'corbeille'], 'readwrite', (s) => {
      const quand = new Date().toISOString();
      s.poi.delete(id);
      s.corbeille.put({ id: id, type: 'poi', quand: quand });
      const dem = s.photos.index('poiId').getAllKeys(IDBKeyRange.only(id));
      dem.onsuccess = () => dem.result.forEach((k) => {
        s.photos.delete(k);
        s.corbeille.put({ id: k, type: 'photo', quand: quand });
      });
      const dc = s.circuits.getAll();
      dc.onsuccess = () => dc.result.forEach((c) => {
        if (c.etapes.indexOf(id) === -1) return;
        c.etapes = c.etapes.filter((e) => e !== id);
        c.modifie = quand;
        s.circuits.put(c);
      });
    });
  }

  /* ---------- Photos ---------- */

  function photosDuPoi(poiId) {
    return tx('photos', 'readonly', (s) => s.index('poiId').getAll(IDBKeyRange.only(poiId)))
      .then((l) => l.sort((a, b) => a.ordre - b.ordre));
  }

  function photoCompter(poiId) {
    return tx('photos', 'readonly', (s) => s.index('poiId').count(IDBKeyRange.only(poiId)));
  }

  function photoAjouter(o) {
    o.id = o.id || identifiant();
    o.ajoute = o.ajoute || new Date().toISOString();
    o.modifie = o.ajoute;
    return tx('photos', 'readwrite', (s) => s.put(o)).then(() => o);
  }

  function photoEnregistrer(o) {
    o.modifie = new Date().toISOString();
    return tx('photos', 'readwrite', (s) => s.put(o)).then(() => o);
  }

  function photoSupprimer(id) {
    return tx(['photos', 'corbeille'], 'readwrite', (s) => {
      s.photos.delete(id);
      s.corbeille.put({ id: id, type: 'photo', quand: new Date().toISOString() });
    });
  }

  /* Réécrit le champ `ordre` d'après la liste d'identifiants fournie. */
  function photosReordonner(ids) {
    const quand = new Date().toISOString();
    return tx('photos', 'readwrite', (s) => {
      ids.forEach((id, i) => {
        const dem = s.get(id);
        dem.onsuccess = () => {
          const p = dem.result;
          /* Ne réécrire que ce qui bouge : sans ce test, réafficher la galerie
           * daterait toutes les photos et ferait croire à un changement. */
          if (p && p.ordre !== i) { p.ordre = i; p.modifie = quand; s.put(p); }
        };
      });
    });
  }

  /* Photo de couverture et compte, pour tous les POI en un seul balayage :
   * une requête par fiche ferait autant d'allers-retours qu'il y a de fiches,
   * et deux balayages séparés liraient la table deux fois pour rien.
   * `dernier` sert au rappel d'export. */
  function resumePhotos() {
    return tout('photos').then((l) => {
      const vignettes = {};
      const comptes = {};
      let dernier = '';
      l.forEach((p) => {
        comptes[p.poiId] = (comptes[p.poiId] || 0) + 1;
        const a = vignettes[p.poiId];
        if (!a || p.ordre < a.ordre) vignettes[p.poiId] = p;
        const d = dateDe(p);
        if (d > dernier) dernier = d;
      });
      return { vignettes: vignettes, comptes: comptes, dernier: dernier };
    });
  }

  /* ---------- Corbeille ---------- */

  /* Date de référence d'un enregistrement, pour comparer deux versions.
   * `modifie` d'abord ; `ajoute` pour les photos des carnets d'avant la
   * version 2, qui n'en avaient pas ; `cree` en dernier recours. */
  function dateDe(o) {
    return (o && (o.modifie || o.ajoute || o.cree)) || '';
  }

  function corbeilleTout() { return tout('corbeille'); }

  function dernierEffacement() {
    return corbeilleTout().then((l) =>
      l.reduce((m, x) => (x.quand > m ? x.quand : m), ''));
  }

  /* ---------- Circuits ---------- */

  function circuitNeuf(champs) {
    const t = new Date().toISOString();
    return Object.assign({
      id: identifiant(),
      nom: '',
      description: '',
      couleur: '#c2411f',
      etapes: [],
      cree: t,
      modifie: t
    }, champs || {});
  }

  function circuitTous() { return tout('circuits'); }

  function circuitLire(id) {
    return tx('circuits', 'readonly', (s) => s.get(id));
  }

  function circuitEnregistrer(c) {
    c.modifie = new Date().toISOString();
    return tx('circuits', 'readwrite', (s) => s.put(c)).then(() => c);
  }

  function circuitSupprimer(id) {
    return tx(['circuits', 'corbeille'], 'readwrite', (s) => {
      s.circuits.delete(id);
      s.corbeille.put({ id: id, type: 'circuit', quand: new Date().toISOString() });
    });
  }

  /* ---------- Réglages ---------- */

  const REGLAGES_DEFAUT = {
    /* Le fond épuré est le plus proche de la carte vierge attendue : les lieux
     * qui comptent sont ceux qu'on y pose soi-même. */
    fond: 'epure',
    qualitePhoto: 'equilibre',
    zoneDepart: 'france',
    afficherVisitees: true,
    afficherEnvies: true,
    /* Date ISO du dernier export réussi — sert au rappel de sauvegarde.
     * Chaîne vide : aucune archive n'a jamais été produite ici. */
    derniereArchive: ''
  };

  function reglagesLire() {
    return tout('reglages').then((l) => {
      const r = Object.assign({}, REGLAGES_DEFAUT);
      l.forEach((o) => { r[o.cle] = o.valeur; });
      return r;
    });
  }

  function reglageEcrire(cle, valeur) {
    return tx('reglages', 'readwrite', (s) => s.put({ cle: cle, valeur: valeur }));
  }

  /* ---------- Sauvegarde ---------- */

  /* Contenu complet, photos et corbeille comprises, pour l'archive. */
  function toutLire() {
    return Promise.all([poiTous(), circuitTous(), tout('photos'), reglagesLire(), corbeilleTout()])
      .then((r) => ({ poi: r[0], circuits: r[1], photos: r[2], reglages: r[3], corbeille: r[4] }));
  }

  /* Restauration.
   *
   * En mode « remplacement », le carnet est vidé puis réécrit tel quel.
   *
   * En mode « fusion », les deux carnets sont réunis en comparant les dates,
   * enregistrement par enregistrement — c'est ce qui rend l'aller-retour
   * téléphone ↔ ordinateur sûr dans les deux sens :
   *
   *   — un identifiant absent d'ici est ajouté ;
   *   — un identifiant présent des deux côtés garde la version dont la date de
   *     modification est la plus récente ;
   *   — une suppression est traitée comme une modification datée : si elle est
   *     postérieure à la version d'en face, elle l'emporte ; sinon la fiche
   *     ressuscite, parce qu'on l'a manifestement retouchée depuis.
   *
   * Les dates viennent de l'horloge de chaque appareil : deux appareils très
   * désynchronisés pourraient donc trancher à l'envers. C'est le prix d'une
   * fusion sans serveur pour arbitrer, et le bilan renvoyé permet de le voir.
   */
  function toutEcrire(donnees, fusion) {
    return ouvrir().then((d) => new Promise((resoudre, rejeter) => {
      const t = d.transaction(['poi', 'photos', 'circuits', 'reglages', 'corbeille'], 'readwrite');
      const magasins = {
        poi: t.objectStore('poi'),
        photo: t.objectStore('photos'),
        circuit: t.objectStore('circuits')
      };
      const sRe = t.objectStore('reglages');
      const sCorb = t.objectStore('corbeille');
      const bilan = { ajoutes: 0, actualises: 0, gardes: 0, supprimes: 0, retablis: 0 };

      if (donnees.reglages) {
        Object.keys(donnees.reglages).forEach((k) => sRe.put({ cle: k, valeur: donnees.reglages[k] }));
      }

      if (!fusion) {
        magasins.poi.clear(); magasins.photo.clear(); magasins.circuit.clear(); sCorb.clear();
        [['poi', donnees.poi], ['photo', donnees.photos], ['circuit', donnees.circuits]]
          .forEach((paire) => (paire[1] || []).forEach((o) => {
            if (o && o.id) { magasins[paire[0]].put(o); bilan.ajoutes++; }
          }));
        (donnees.corbeille || []).forEach((x) => { if (x && x.id) sCorb.put(x); });
        t.oncomplete = () => resoudre(bilan);
        t.onerror = () => rejeter(t.error);
        return;
      }

      /* La corbeille locale est lue d'abord : elle conditionne le sort de
       * chaque enregistrement entrant. La transaction reste ouverte tant que
       * de nouvelles requêtes naissent dans les rappels de succès. */
      sCorb.getAll().onsuccess = (e) => {
        const efface = {};
        e.target.result.forEach((x) => { efface[x.id] = x.quand; });

        /* Un enregistrement dont l'archive porte aussi la suppression n'a rien
         * à faire dans le lot à ajouter : on ne veut pas l'écrire pour
         * l'effacer trois requêtes plus loin. */
        const effaceParArchive = {};
        (donnees.corbeille || []).forEach((x) => {
          if (x && x.id && x.quand) effaceParArchive[x.id] = x.quand;
        });

        const fusionner = (type, liste) => {
          const magasin = magasins[type];
          (liste || []).forEach((o) => {
            if (!o || !o.id || effaceParArchive[o.id]) return;
            /* Une photo dont la fiche a été supprimée ici ne revient pas
             * seule : elle serait rattachée à un POI absent. */
            if (type === 'photo' && o.poiId && efface[o.poiId] &&
                efface[o.poiId] >= dateDe(o)) { bilan.gardes++; return; }
            const dEntrant = dateDe(o);
            if (efface[o.id] && efface[o.id] >= dEntrant) { bilan.gardes++; return; }
            const g = magasin.get(o.id);
            g.onsuccess = () => {
              if (!g.result) {
                magasin.add(o);
                if (efface[o.id]) { sCorb.delete(o.id); bilan.retablis++; }
                else bilan.ajoutes++;
                return;
              }
              if (dEntrant > dateDe(g.result)) { magasin.put(o); bilan.actualises++; }
              else bilan.gardes++;
            };
          });
        };
        fusionner('poi', donnees.poi);
        fusionner('photo', donnees.photos);
        fusionner('circuit', donnees.circuits);

        (donnees.corbeille || []).forEach((x) => {
          if (!x || !x.id || !x.quand) return;
          const magasin = magasins[x.type] || magasins.poi;
          const g = magasin.get(x.id);
          g.onsuccess = () => {
            if (g.result && dateDe(g.result) <= x.quand) {
              magasin.delete(x.id);
              bilan.supprimes++;
            }
            /* La trace est conservée même si l'objet n'était pas là : sans
             * elle, la suppression reviendrait au prochain échange. */
            if (!efface[x.id] || efface[x.id] < x.quand) sCorb.put(x);
          };
        });
      };

      t.oncomplete = () => resoudre(bilan);
      t.onerror = () => rejeter(t.error);
    }));
  }

  /* Après une fusion : photos rattachées à une fiche absente, étapes de
   * circuit pointant vers un POI absent. Deux carnets réunis peuvent en
   * produire, et rien d'autre ne les ramasserait. */
  function nettoyerOrphelins() {
    return Promise.all([poiTous(), tout('photos'), circuitTous()]).then((r) => {
      const existe = {};
      r[0].forEach((p) => { existe[p.id] = true; });
      const photosMortes = r[1].filter((p) => !existe[p.poiId]).map((p) => p.id);
      const circuitsATailler = r[2].filter((c) => (c.etapes || []).some((e) => !existe[e]));
      if (!photosMortes.length && !circuitsATailler.length) return { photos: 0, circuits: 0 };
      return tx(['photos', 'circuits'], 'readwrite', (s) => {
        photosMortes.forEach((id) => s.photos.delete(id));
        circuitsATailler.forEach((c) => {
          c.etapes = c.etapes.filter((e) => existe[e]);
          s.circuits.put(c);
        });
      }).then(() => ({ photos: photosMortes.length, circuits: circuitsATailler.length }));
    });
  }

  /* Effacement délibéré du carnet : la corbeille est vidée elle aussi. Garder
   * les traces empêcherait de restaurer une archive juste après — chaque
   * fiche y serait vue comme supprimée. */
  function toutEffacer() {
    return tx(['poi', 'photos', 'circuits', 'corbeille'], 'readwrite', (s) => {
      s.poi.clear(); s.photos.clear(); s.circuits.clear(); s.corbeille.clear();
    });
  }

  function place() {
    if (!navigator.storage || !navigator.storage.estimate) return Promise.resolve(null);
    return navigator.storage.estimate().catch(() => null);
  }

  /* Demande au navigateur de ne pas évincer la base quand l'espace manque.
   * Sans cela, un navigateur peut faire le ménage dans les données d'un site
   * peu visité — ce qui, ici, effacerait le carnet. */
  function rendrePersistant() {
    if (!navigator.storage || !navigator.storage.persist) return Promise.resolve(false);
    return navigator.storage.persisted()
      .then((deja) => (deja ? true : navigator.storage.persist()))
      .catch(() => false);
  }

  racine.BASE = {
    identifiant: identifiant, ouvrir: ouvrir,
    poiNeuf: poiNeuf, poiTous: poiTous, poiLire: poiLire,
    poiEnregistrer: poiEnregistrer, poiSupprimer: poiSupprimer,
    photosDuPoi: photosDuPoi, photoCompter: photoCompter, photoAjouter: photoAjouter,
    photoEnregistrer: photoEnregistrer, photoSupprimer: photoSupprimer,
    photosReordonner: photosReordonner, resumePhotos: resumePhotos,
    dateDe: dateDe, corbeilleTout: corbeilleTout, dernierEffacement: dernierEffacement,
    nettoyerOrphelins: nettoyerOrphelins,
    circuitNeuf: circuitNeuf, circuitTous: circuitTous, circuitLire: circuitLire,
    circuitEnregistrer: circuitEnregistrer, circuitSupprimer: circuitSupprimer,
    REGLAGES_DEFAUT: REGLAGES_DEFAUT, reglagesLire: reglagesLire, reglageEcrire: reglageEcrire,
    toutLire: toutLire, toutEcrire: toutEcrire, toutEffacer: toutEffacer,
    place: place, rendrePersistant: rendrePersistant
  };

})(typeof self !== 'undefined' ? self : this);

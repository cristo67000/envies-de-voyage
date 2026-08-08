'use strict';
/*
 * Réglages, sauvegarde et restauration.
 *
 * L'archive exportée est lisible sans cette application : un JSON en clair,
 * et les photographies en JPEG dans un sous-dossier. C'est délibéré — un
 * carnet de repérage se garde des années, et rien ne dit que le logiciel qui
 * l'a produit sera encore là. Le format doit survivre à l'outil.
 */
(function (EV) {

  const $ = EV.$, $$ = EV.$$, S = EV.S;

  /* Version 2 : l'archive transporte aussi la corbeille, sans quoi les
   * suppressions ne pourraient pas voyager d'un appareil à l'autre. Les
   * archives de version 1 restent lisibles — elles arrivent simplement sans
   * corbeille, donc sans suppression à propager. */
  const FORMAT = 2;

  /* ------------------------------------------------------------- Affichage */

  function texteEtatSauvegarde() {
    const e = EV.etatSauvegarde();
    if (e.vide) return { texte: 'Rien à sauvegarder pour l\'instant.', ton: 'neutre' };
    if (!e.derniere) {
      return { texte: 'Ce carnet n\'a jamais été exporté. Il n\'existe qu\'ici.', ton: 'alerte' };
    }
    const quand = new Date(e.derniere);
    const lisible = quand.toLocaleDateString('fr-FR') + ' à ' +
      quand.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (e.aJour) {
      return { texte: 'À jour : archive du ' + lisible + ', rien n\'a changé depuis.', ton: 'bon' };
    }
    const j = Math.floor(e.jours);
    return {
      texte: 'Dernière archive le ' + lisible + ' — ' +
        (j <= 0 ? 'des modifications ont eu lieu depuis.'
          : 'il y a ' + j + (j > 1 ? ' jours' : ' jour') + ', et le carnet a changé depuis.'),
      ton: 'alerte'
    };
  }

  function rafraichirEtatSauvegarde() {
    const p = $('#r-sauvegarde-etat');
    if (!p) return;
    const e = texteEtatSauvegarde();
    p.textContent = e.texte;
    p.className = 'etat-sauvegarde ' + e.ton;
    EV.majPastilleSauvegarde();
  }

  function marquerSauvegarde(quand) {
    const iso = quand || new Date().toISOString();
    S.reglages.derniereArchive = iso;
    return BASE.reglageEcrire('derniereArchive', iso).then(rafraichirEtatSauvegarde);
  }

  function rafraichirReglages() {
    rafraichirEtatSauvegarde();
    $('#r-fond').value = S.reglages.fond || 'epure';
    $('#r-zone').value = S.reglages.zoneDepart || 'france';
    const r = document.querySelector('#r-qualite input[value="' + (S.reglages.qualitePhoto || 'equilibre') + '"]');
    if (r) r.checked = true;
    $('#e-photo-profil').value = S.reglages.qualitePhoto || 'equilibre';

    EV.etatPermissionGeo().then((e) => { $('#geo-etat-val').textContent = e; });

    BASE.place().then((p) => {
      if (!p || !p.usage) { $('#r-place').textContent = ''; return; }
      const parts = ['Le carnet occupe ' + PHOTOS.formaterPoids(p.usage)];
      if (p.quota) {
        parts.push('sur environ ' + PHOTOS.formaterPoids(p.quota) + ' disponibles pour ce site');
      }
      const nbP = Object.keys(S.comptes).reduce((a, k) => a + S.comptes[k], 0);
      parts.push(S.poi.length + ' envie' + (S.poi.length > 1 ? 's' : '') +
        ', ' + nbP + ' photographie' + (nbP > 1 ? 's' : ''));
      $('#r-place').textContent = parts.join(' · ') + '.';
    });
  }

  /* ------------------------------------------------------------- Sauvegarde */

  function horodateur() {
    const d = new Date();
    const n = (x) => String(x).padStart(2, '0');
    return d.getFullYear() + n(d.getMonth() + 1) + n(d.getDate()) + '-' + n(d.getHours()) + n(d.getMinutes());
  }

  const LISEZMOI =
    'Archive du carnet « Mes envies de voyage »\n' +
    '==========================================\n\n' +
    'carnet.json  — toutes les fiches, les circuits et les réglages, en texte clair.\n' +
    'photos/      — les photographies, en JPEG. Chaque fichier porte l\'identifiant\n' +
    '               indiqué dans carnet.json ; les fichiers « -v » sont les vignettes.\n\n' +
    'Le champ "corbeille" de carnet.json ne contient que des identifiants et des\n' +
    'dates de suppression. Il sert à ce qu\'une fiche effacée sur un appareil ne\n' +
    'revienne pas lors d\'une fusion avec un autre : ni nom, ni position, ni note.\n\n' +
    'Pour restaurer : ouvrez l\'application, Réglages → Restaurer une archive.\n' +
    'Le contenu reste exploitable sans elle : le JSON s\'ouvre dans n\'importe quel\n' +
    'éditeur de texte, les photos dans n\'importe quelle visionneuse.\n';

  function exporter() {
    EV.toast('Préparation de l\'archive…');
    let horodatage = null;
    BASE.toutLire().then((d) => {
      const entrees = [];
      const photos = d.photos.map((p) => {
        const base = 'photos/' + p.id;
        if (p.image) entrees.push({ nom: base + '.jpg', donnees: p.image });
        if (p.vignette) entrees.push({ nom: base + '-v.jpg', donnees: p.vignette });
        return {
          id: p.id, poiId: p.poiId, ordre: p.ordre,
          largeur: p.largeur, hauteur: p.hauteur,
          poids: p.poids, poidsOrigine: p.poidsOrigine,
          nomOrigine: p.nomOrigine, profil: p.profil,
          prise: p.prise || '', ajoute: p.ajoute, modifie: p.modifie || p.ajoute,
          fichier: p.image ? base + '.jpg' : null,
          vignetteFichier: p.vignette ? base + '-v.jpg' : null
        };
      });
      horodatage = new Date().toISOString();
      const carnet = {
        format: FORMAT,
        application: 'Mes envies de voyage',
        version: EV.VERSION,
        exporte: horodatage,
        poi: d.poi,
        circuits: d.circuits,
        reglages: d.reglages,
        photos: photos,
        corbeille: d.corbeille || []
      };
      entrees.unshift({ nom: 'carnet.json', donnees: JSON.stringify(carnet, null, 1) });
      entrees.push({ nom: 'LISEZMOI.txt', donnees: LISEZMOI });
      return ZIP.creer(entrees);
    }).then((blob) => {
      EV.telecharger(blob, 'envies-de-voyage-' + horodateur() + '.zip');
      EV.toast('Archive enregistrée — ' + PHOTOS.formaterPoids(blob.size) + '.');
      /* Le repère n'est posé qu'une fois le fichier réellement produit : sinon
       * un export échoué ferait croire le carnet à l'abri. */
      return marquerSauvegarde(horodatage);
    }).catch((e) => {
      EV.toast('L\'export a échoué : ' + (e.message || e), true);
    });
  }

  /* ------------------------------------------------------------ Restauration */

  function restaurer(fichier) {
    if (!fichier) return;
    EV.toast('Lecture de l\'archive…');
    ZIP.lire(fichier).then((entrees) => {
      const parNom = {};
      entrees.forEach((e) => { parNom[e.nom] = e.donnees; });
      const brut = parNom['carnet.json'];
      if (!brut) throw new Error('Cette archive ne contient pas de carnet.json.');
      const carnet = JSON.parse(new TextDecoder('utf-8').decode(brut));
      if (!carnet || !Array.isArray(carnet.poi)) throw new Error('Le carnet de cette archive est illisible.');

      const photos = (carnet.photos || []).map((p) => {
        const im = p.fichier ? parNom[p.fichier] : null;
        const vi = p.vignetteFichier ? parNom[p.vignetteFichier] : null;
        if (!im && !vi) return null;
        const o = Object.assign({}, p);
        delete o.fichier;
        delete o.vignetteFichier;
        o.image = new Blob([im || vi], { type: 'image/jpeg' });
        o.vignette = new Blob([vi || im], { type: 'image/jpeg' });
        return o;
      }).filter(Boolean);

      const resume = carnet.poi.length + ' envie' + (carnet.poi.length > 1 ? 's' : '') +
        ', ' + (carnet.circuits || []).length + ' circuit' + ((carnet.circuits || []).length > 1 ? 's' : '') +
        ', ' + photos.length + ' photographie' + (photos.length > 1 ? 's' : '');

      return choisirModeRestauration(resume, carnet).then((mode) => {
        if (!mode) return null;
        return BASE.toutEcrire({
          poi: carnet.poi, circuits: carnet.circuits || [],
          photos: photos, reglages: carnet.reglages,
          corbeille: carnet.corbeille || []
        }, mode === 'fusion')
          .then((bilan) => (mode === 'fusion' ? BASE.nettoyerOrphelins().then(() => bilan) : bilan))
          .then((bilan) => ({ mode: mode, bilan: bilan, exporte: carnet.exporte }));
      });
    }).then((issue) => {
      if (!issue) return;
      return BASE.reglagesLire().then((r) => {
        S.reglages = r;
        EV.appliquerFond(r.fond);
        return EV.rechargerDonnees();
      }).then(() => {
        /* Après un remplacement, le carnet est exactement l'archive que vous
         * tenez : il est donc à l'abri, et le repère prend la date de cet
         * export. Après une fusion, le résultat n'existe dans aucun fichier —
         * le rappel reste allumé, et c'est voulu. */
        const suite = issue.mode === 'remplacement'
          ? marquerSauvegarde(issue.exporte || new Date().toISOString())
          : Promise.resolve();
        return suite.then(() => {
          rafraichirReglages();
          EV.cadrerSurTout();
          EV.toast(texteBilan(issue.mode, issue.bilan));
        });
      });
    }).catch((e) => {
      EV.toast('Restauration impossible : ' + (e.message || e), true);
    });
  }

  /* Dire ce qui s'est passé, pas seulement que ça s'est passé : après une
   * fusion, savoir combien de fiches ont été écartées parce que la version
   * d'ici était plus récente évite de croire l'archive ignorée. */
  function texteBilan(mode, b) {
    if (!b) return 'Carnet restauré.';
    if (mode === 'remplacement') {
      return 'Carnet remplacé — ' + b.ajoutes + ' élément' + (b.ajoutes > 1 ? 's' : '') + ' repris.';
    }
    const bouts = [];
    if (b.ajoutes) bouts.push(b.ajoutes + ' ajouté' + (b.ajoutes > 1 ? 's' : ''));
    if (b.actualises) bouts.push(b.actualises + ' mis à jour');
    if (b.gardes) bouts.push(b.gardes + ' inchangé' + (b.gardes > 1 ? 's' : '') + ' (version d\'ici plus récente)');
    if (b.supprimes) bouts.push(b.supprimes + ' supprimé' + (b.supprimes > 1 ? 's' : '') + ' comme sur l\'autre appareil');
    if (b.retablis) bouts.push(b.retablis + ' rétabli' + (b.retablis > 1 ? 's' : ''));
    return bouts.length ? 'Carnets réunis — ' + bouts.join(', ') + '.'
      : 'Carnets réunis — les deux étaient déjà identiques.';
  }

  /* Deux façons de restaurer, et la différence compte assez pour être posée
   * explicitement plutôt que devinée. */
  function choisirModeRestauration(resume, carnet) {
    const effacements = (carnet.corbeille || []).length;
    const quand = carnet.exporte ? new Date(carnet.exporte).toLocaleDateString('fr-FR') : null;
    const aide = resume + (quand ? ' — archive du ' + quand : '');
    return new Promise((resoudre) => {
      EV.menuContextuel($('#r-importer'), [
        { titre: 'Réunir avec mon carnet',
          aide: aide + '. La version la plus récente de chaque fiche l\'emporte' +
            (effacements ? ', suppressions comprises' : ''),
          action: () => resoudre('fusion') },
        { titre: 'Remplacer tout mon carnet', aide: 'Efface d\'abord ce qui est ici',
          action: () => EV.confirmer('Remplacer entièrement le carnet actuel par cette archive (' +
            resume + ') ? Ce qui est ici sera effacé.', 'Remplacer')
            .then((ok) => resoudre(ok ? 'remplacement' : null)) },
        { titre: 'Ne rien faire', action: () => resoudre(null) }
      ]);
    });
  }

  /* ---------------------------------------------------------------- Divers */

  function exporterToutGpx() {
    if (!S.poi.length) { EV.toast('Le carnet est vide.', true); return; }
    const gpx = EV.versGpx(S.poi.slice().sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr')), null);
    EV.telecharger(new Blob([gpx], { type: 'application/gpx+xml' }),
      'envies-de-voyage-' + horodateur() + '.gpx');
    EV.toast(S.poi.length + ' points exportés en GPX.');
  }

  function toutEffacer() {
    EV.confirmer('Effacer la totalité du carnet — envies, notes, photographies et circuits ? ' +
      'Rien ne pourra être récupéré si vous n\'avez pas exporté d\'archive.',
      'Tout effacer').then((ok) => {
      if (!ok) return;
      return EV.confirmer('Dernière vérification : voulez-vous vraiment tout effacer ?', 'Oui, tout effacer')
        .then((encore) => {
          if (!encore) return;
          return BASE.toutEffacer().then(() => {
            EV.effacerTraceCircuit();
            return EV.rechargerDonnees();
          }).then(() => {
            rafraichirReglages();
            EV.toast('Carnet vidé.');
          });
        });
    });
  }

  /* ------------------------------------------------------------- Câblage */

  function brancher() {
    $('#r-fond').addEventListener('change', (e) => {
      S.reglages.fond = e.target.value;
      BASE.reglageEcrire('fond', e.target.value);
      EV.appliquerFond(e.target.value);
    });
    $('#r-zone').addEventListener('change', (e) => {
      S.reglages.zoneDepart = e.target.value;
      BASE.reglageEcrire('zoneDepart', e.target.value);
      EV.cadreDepart();
    });
    $('#r-exporter').addEventListener('click', exporter);
    $('#r-importer').addEventListener('click', () => $('#fichier-archive').click());
    $('#fichier-archive').addEventListener('change', (e) => {
      restaurer(e.target.files[0]);
      e.target.value = '';
    });
    $('#r-gpx').addEventListener('click', exporterToutGpx);
    $('#r-effacer').addEventListener('click', toutEffacer);
  }

  EV.rafraichirReglages = rafraichirReglages;
  EV.rafraichirEtatSauvegarde = rafraichirEtatSauvegarde;
  EV.brancherReglages = brancher;

})(window.EV);

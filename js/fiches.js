'use strict';
/*
 * Liste des envies, fiche de lecture, éditeur, photographies, visionneuse.
 *
 * L'éditeur n'a pas de bouton « Enregistrer » : chaque champ est écrit dans la
 * base dès qu'il perd le focus, ou après une courte pause de frappe. Sur un
 * téléphone, un formulaire à valider est un formulaire qu'on perd — un appel,
 * un changement d'application, et la saisie est envolée. Le prix à payer est
 * qu'une fiche créée puis abandonnée existe : le bouton « Supprimer » est donc
 * toujours à portée, en bas de l'éditeur.
 */
(function (EV) {

  const $ = EV.$, $$ = EV.$$, S = EV.S;
  const creer = EV.creer, vider = EV.vider;

  let photosEditeur = [];
  let visionneuse = { liste: [], index: 0, urls: [] };
  let minuteurSauvegarde = null;

  /* ================================================================= Liste */

  function construireCasesCategories() {
    const hote = $('#cat-cases');
    vider(hote);
    CAT.parFamille().forEach((f) => {
      const t = creer('p', 'fam', f.nom);
      t.style.setProperty('color', f.couleur);
      hote.appendChild(t);
      const rangee = creer('div', 'cases-rangee');
      f.categories.forEach((cle) => {
        const l = creer('label', 'case-cat');
        const c = document.createElement('input');
        c.type = 'checkbox';
        c.value = cle;
        c.checked = !S.filtre.categories || S.filtre.categories.indexOf(cle) !== -1;
        c.addEventListener('change', surChangementCategories);
        l.appendChild(c);
        l.appendChild(creer('span', null, CAT.nomDe(cle)));
        rangee.appendChild(l);
      });
      hote.appendChild(rangee);
    });
  }

  function surChangementCategories() {
    const cases = $$('#cat-cases input[type="checkbox"]');
    const coches = cases.filter((c) => c.checked).map((c) => c.value);
    S.filtre.categories = coches.length === cases.length ? null : coches;
    const n = $('#filtre-cat-compte');
    n.textContent = S.filtre.categories ? '(' + coches.length + ')' : '';
    EV.dessinerEpingles();
    rafraichirListe();
  }

  function poiFiltres() {
    const q = EV.normaliser(S.filtre.q);
    let l = S.poi.filter((p) => {
      if (S.filtre.statut !== 'tous' && p.statut !== S.filtre.statut) return false;
      if (S.filtre.categories && S.filtre.categories.indexOf(p.categorie) === -1) return false;
      if (!q) return true;
      return EV.normaliser(p.nom).indexOf(q) !== -1 ||
        EV.normaliser(p.adresse).indexOf(q) !== -1 ||
        EV.normaliser(p.notes).indexOf(q) !== -1 ||
        EV.normaliser(p.avis).indexOf(q) !== -1 ||
        EV.normaliser(CAT.nomDe(p.categorie)).indexOf(q) !== -1;
    });
    const tri = S.tri;
    l.sort((a, b) => {
      if (tri === 'nom') return (a.nom || '').localeCompare(b.nom || '', 'fr');
      if (tri === 'categorie') {
        const c = CAT.nomDe(a.categorie).localeCompare(CAT.nomDe(b.categorie), 'fr');
        return c || (a.nom || '').localeCompare(b.nom || '', 'fr');
      }
      if (tri === 'etoiles') return (b.etoiles || 0) - (a.etoiles || 0) ||
        (a.nom || '').localeCompare(b.nom || '', 'fr');
      if (tri === 'distance') {
        const da = EV.distanceDepuisMoi(a), db = EV.distanceDepuisMoi(b);
        if (da == null || db == null) return 0;
        return da - db;
      }
      return (b.cree || '').localeCompare(a.cree || '');
    });
    return l;
  }

  function ligneListe(p, options) {
    const o = options || {};
    const li = creer('li', 'item');
    li.dataset.id = p.id;

    const vign = S.vignettes[p.id];
    if (vign && vign.vignette && !o.sansPhoto) {
      const im = document.createElement('img');
      im.className = 'vign';
      im.alt = '';
      im.loading = 'lazy';
      im.src = EV.urlBlob(vign.vignette, 'liste');
      li.appendChild(im);
    } else {
      const past = creer('span', 'pastille');
      past.style.setProperty('--fam', CAT.couleurDe(p.categorie));
      past.innerHTML = CAT.svgSymbole(p.categorie, 19);
      li.appendChild(past);
    }

    const txt = creer('span', 'txt');
    txt.appendChild(creer('span', 'n', p.nom || 'Sans nom'));
    const bouts = [CAT.nomDe(p.categorie)];
    if (p.adresse) bouts.push(p.adresse);
    const n = S.comptes[p.id] || 0;
    if (n) bouts.push(n + (n > 1 ? ' photos' : ' photo'));
    txt.appendChild(creer('span', 's', bouts.join(' · ')));
    li.appendChild(txt);

    const fin = creer('span', 'fin');
    if (p.statut === 'visite') {
      const e = creer('span', 'etoiles');
      e.textContent = p.etoiles ? '★'.repeat(p.etoiles) : '✓';
      fin.appendChild(e);
      fin.appendChild(document.createElement('br'));
    }
    const d = EV.distanceDepuisMoi(p);
    if (d != null) fin.appendChild(creer('span', null, EV.formaterDistance(d)));
    li.appendChild(fin);

    return li;
  }

  function rafraichirListe() {
    const liste = $('#liste');
    if (!liste) return;
    EV.libererUrls('liste');
    vider(liste);
    const l = poiFiltres();

    $('#liste-vide').hidden = S.poi.length !== 0;
    const total = S.poi.length;
    const visitees = S.poi.filter((p) => p.statut === 'visite').length;
    $('#liste-resume').textContent = total === 0 ? '' :
      (l.length === total
        ? total + (total > 1 ? ' envies' : ' envie') + ' · ' + visitees + ' visitée' + (visitees > 1 ? 's' : '')
        : l.length + ' sur ' + total);

    if (S.tri === 'distance' && !S.position) {
      const p = creer('p', 'note', 'Touchez ⊕ sur la carte pour connaître votre position et trier par distance.');
      liste.appendChild(p);
    }

    l.forEach((p) => {
      const li = ligneListe(p);
      li.addEventListener('click', () => ouvrirFiche(p.id));
      liste.appendChild(li);
    });
  }

  /* ================================================================= Fiche */

  function ouvrirFiche(id, silencieux) {
    const p = S.parId[id];
    if (!p) return;
    S.ficheId = id;
    $('#editeur').hidden = true;
    $('#choix-etapes').hidden = true;

    $('#f-sym').style.setProperty('--fam', CAT.couleurDe(p.categorie));
    $('#f-sym').innerHTML = CAT.svgSymbole(p.categorie, 18);
    $('#f-cat-txt').textContent = CAT.nomDe(p.categorie);
    $('#f-nom').textContent = p.nom || 'Sans nom';

    const etat = $('#f-etat');
    vider(etat);
    if (p.statut === 'visite') {
      etat.appendChild(creer('span', 'marque visite', 'Visité'));
      if (p.dateVisite) etat.appendChild(creer('span', 'discret', 'le ' + EV.formaterDate(p.dateVisite) + ' '));
      if (p.etoiles) {
        const e = creer('span', 'etoiles');
        e.textContent = '★'.repeat(p.etoiles);
        const c = creer('span', 'creux');
        c.textContent = '☆'.repeat(3 - p.etoiles);
        e.appendChild(c);
        etat.appendChild(e);
        etat.appendChild(creer('span', 'discret', ' ' + EV.MOTS_ETOILES[p.etoiles]));
      }
    } else {
      etat.appendChild(creer('span', 'marque envie', 'À voir'));
    }

    $('#f-adresse').textContent = p.adresse || '';
    $('#f-adresse').hidden = !p.adresse;

    $('#f-bloc-notes').hidden = !p.notes;
    $('#f-notes').textContent = p.notes || '';
    $('#f-bloc-avis').hidden = !(p.statut === 'visite' && p.avis);
    $('#f-avis').textContent = p.avis || '';

    const liens = (p.liens || []).filter((x) => EV.urlSure(x.url));
    $('#f-bloc-liens').hidden = !liens.length;
    const ul = $('#f-liens');
    vider(ul);
    liens.forEach((x) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = EV.urlSure(x.url);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = x.titre || x.url;
      const u = creer('span', 'u', EV.urlSure(x.url).replace(/^https?:\/\//, ''));
      a.appendChild(u);
      li.appendChild(a);
      ul.appendChild(li);
    });

    const dansCircuits = S.circuits.filter((c) => c.etapes.indexOf(id) !== -1);
    $('#f-bloc-circuits').hidden = !dansCircuits.length;
    const uc = $('#f-circuits');
    vider(uc);
    dansCircuits.forEach((c) => {
      const li = document.createElement('li');
      const b = creer('button', 'lien-circuit', (c.nom || 'Circuit sans nom') +
        ' — étape ' + (c.etapes.indexOf(id) + 1) + ' sur ' + c.etapes.length);
      b.type = 'button';
      b.addEventListener('click', () => EV.ouvrirCircuit(c.id));
      li.appendChild(b);
      uc.appendChild(li);
    });

    const d = EV.distanceDepuisMoi(p);
    $('#f-distance').hidden = d == null;
    if (d != null) $('#f-distance').textContent = 'À ' + EV.formaterDistance(d) + ' de vous, à vol d\'oiseau.';

    chargerGalerieFiche(id);

    $('#fiche').hidden = false;
    EV.marquerSelection(id);
    if (!silencieux) EV.centrer(p.lat, p.lon);
    if (!EV.estGrandEcran()) EV.fermerTiroir();
  }

  function chargerGalerieFiche(id) {
    const g = $('#f-galerie');
    EV.libererUrls('fiche');
    vider(g);
    g.hidden = true;
    BASE.photosDuPoi(id).then((liste) => {
      if (S.ficheId !== id || !liste.length) return;
      liste.forEach((ph, i) => {
        const im = document.createElement('img');
        im.alt = 'Photographie ' + (i + 1) + ' de ' + (S.parId[id] ? S.parId[id].nom : '');
        im.loading = 'lazy';
        im.src = EV.urlBlob(ph.vignette || ph.image, 'fiche');
        im.addEventListener('click', () => ouvrirVisionneuse(liste, i));
        g.appendChild(im);
      });
      g.hidden = false;
    });
  }

  function fermerFiche() {
    $('#fiche').hidden = true;
    S.ficheId = null;
    EV.marquerSelection(null);
  }

  /* =============================================================== Éditeur */

  function creerPoi(lat, lon, champs) {
    const p = BASE.poiNeuf(Object.assign({
      lat: lat, lon: lon,
      nom: '', categorie: 'autre'
    }, champs || {}));
    return BASE.poiEnregistrer(p)
      .then(() => EV.rechargerDonnees())
      .then(() => {
        EV.centrer(p.lat, p.lon, Math.max(EV.carte().getZoom(), 13));
        ouvrirEditeur(p.id, true);
      });
  }

  function ouvrirEditeur(id, neuf) {
    const p = S.parId[id];
    if (!p) return;
    S.editionId = id;
    $('#fiche').hidden = true;
    $('#choix-etapes').hidden = true;
    $('#e-titre').textContent = neuf ? 'Nouvelle envie' : 'Modifier';

    $('#e-nom').value = p.nom || '';
    $('#e-notes').value = p.notes || '';
    $('#e-adresse').value = p.adresse || '';
    $('#e-avis').value = p.avis || '';
    $('#e-date').value = p.dateVisite || '';
    majCategories(p.categorie);
    replierCategories(!neuf);
    majStatut(p.statut);
    majEtoiles(p.etoiles || 0);
    majPosition(p);
    construireLiens(p);
    chargerPhotosEditeur(id);

    $('#editeur').hidden = false;
    EV.marquerSelection(id);
    if (!EV.estGrandEcran()) EV.fermerTiroir();
    if (neuf) setTimeout(() => $('#e-nom').focus(), 120);
  }

  function fermerEditeur() {
    const id = S.editionId;
    ecrireMaintenant();
    $('#editeur').hidden = true;
    S.editionId = null;
    EV.libererUrls('editeur');
    EV.rechargerDonnees().then(() => { if (id && S.parId[id]) ouvrirFiche(id, true); });
  }

  function poiEnEdition() { return S.parId[S.editionId]; }

  /* Écriture différée : trois cents millisecondes après la dernière frappe.
   * Écrire à chaque caractère ferait une transaction IndexedDB par touche. */
  function planifierEcriture() {
    clearTimeout(minuteurSauvegarde);
    minuteurSauvegarde = setTimeout(ecrireMaintenant, 350);
  }

  function ecrireMaintenant() {
    clearTimeout(minuteurSauvegarde);
    const p = poiEnEdition();
    if (!p) return Promise.resolve();
    p.nom = $('#e-nom').value.trim();
    p.notes = $('#e-notes').value;
    p.adresse = $('#e-adresse').value.trim();
    p.avis = $('#e-avis').value;
    p.dateVisite = $('#e-date').value;
    p.liens = lireLiens();
    return BASE.poiEnregistrer(p).then(() => {
      signalerSauvegarde();
      EV.rafraichirEpingle(p.id);
      rafraichirListe();
    });
  }

  let minuteurSauve = null;
  function signalerSauvegarde() {
    const e = $('#e-etat-sauve');
    e.hidden = false;
    e.style.opacity = '1';
    clearTimeout(minuteurSauve);
    minuteurSauve = setTimeout(() => { e.style.opacity = '0'; }, 1400);
  }

  /* ---------- Catégories ---------- */

  function construireGrilleCategories() {
    const hote = $('#e-categories');
    vider(hote);
    CAT.parFamille().forEach((f) => {
      const t = creer('p', 'fam', f.nom);
      t.style.setProperty('color', f.couleur);
      hote.appendChild(t);
      const rangee = creer('div', 'rangee');
      f.categories.forEach((cle) => {
        const b = creer('button');
        b.type = 'button';
        b.dataset.cat = cle;
        b.setAttribute('aria-pressed', 'false');
        b.style.setProperty('--fam', f.couleur);
        b.innerHTML = CAT.svgSymbole(cle, 24);
        b.appendChild(creer('span', 'lb', CAT.nomDe(cle)));
        b.addEventListener('click', () => choisirCategorie(cle));
        rangee.appendChild(b);
      });
      hote.appendChild(rangee);
    });
  }

  function majCategories(cle) {
    $$('#e-categories button').forEach((b) =>
      b.setAttribute('aria-pressed', b.dataset.cat === cle ? 'true' : 'false'));
    const sym = $('#e-cat-sym');
    sym.style.setProperty('--fam', CAT.couleurDe(cle));
    sym.innerHTML = CAT.svgSymbole(cle, 20);
    $('#e-cat-nom').textContent = CAT.nomDe(cle);
  }

  /* La grille des trente-trois symboles occupe la moitié d'un écran de
   * téléphone : elle reste repliée sauf quand on vient précisément la
   * consulter, ou quand la fiche est neuve et n'a pas encore de symbole. */
  function replierCategories(replie) {
    $('#e-categories').hidden = replie;
    $('#e-cat-actuel').setAttribute('aria-expanded', String(!replie));
    $('#e-cat-actuel').classList.toggle('ouvert', !replie);
  }

  function choisirCategorie(cle) {
    const p = poiEnEdition();
    if (!p) return;
    p.categorie = cle;
    majCategories(cle);
    replierCategories(true);
    BASE.poiEnregistrer(p).then(() => {
      signalerSauvegarde();
      EV.rafraichirEpingle(p.id);
      rafraichirListe();
    });
  }

  /* ---------- Statut, étoiles ---------- */

  function majStatut(v) {
    $$('#e-statut button').forEach((b) => {
      const choisi = b.dataset.v === v;
      b.classList.toggle('actif', choisi);
      b.setAttribute('aria-pressed', String(choisi));
    });
    $('#e-bloc-visite').hidden = v !== 'visite';
  }

  function choisirStatut(v) {
    const p = poiEnEdition();
    if (!p) return;
    p.statut = v;
    /* Passer en « visité » sans date : on propose celle du jour, c'est le cas
     * de loin le plus fréquent — on revient de la visite et on note. */
    if (v === 'visite' && !p.dateVisite) {
      p.dateVisite = new Date().toISOString().slice(0, 10);
      $('#e-date').value = p.dateVisite;
    }
    majStatut(v);
    BASE.poiEnregistrer(p).then(() => {
      signalerSauvegarde();
      EV.rafraichirEpingle(p.id);
      rafraichirListe();
    });
  }

  function majEtoiles(n) {
    $$('#e-etoiles button').forEach((b) => b.classList.toggle('on', Number(b.dataset.n) <= n));
    $('#e-etoiles-txt').textContent = n ? EV.MOTS_ETOILES[n] : 'Pas encore d\'appréciation.';
  }

  function choisirEtoiles(n) {
    const p = poiEnEdition();
    if (!p) return;
    p.etoiles = (p.etoiles === n) ? 0 : n;   /* retoucher la même étoile efface */
    majEtoiles(p.etoiles);
    BASE.poiEnregistrer(p).then(() => {
      signalerSauvegarde();
      EV.rafraichirEpingle(p.id);
      rafraichirListe();
    });
  }

  /* ---------- Position ---------- */

  function majPosition(p) {
    $('#e-position').textContent = p.lat.toFixed(5) + '  ·  ' + p.lon.toFixed(5);
  }

  function deplacer() {
    const p = poiEnEdition();
    if (!p) return;
    const id = p.id;
    $('#editeur').hidden = true;
    EV.demanderPoint('Touchez le nouvel emplacement de « ' + (p.nom || 'cette envie') + ' ».',
      (lat, lon) => {
        const q = S.parId[id];
        if (!q) return;
        q.lat = lat; q.lon = lon;
        BASE.poiEnregistrer(q).then(() => {
          EV.rafraichirEpingle(id);
          ouvrirEditeur(id);
          EV.toast('Emplacement mis à jour.');
        });
      });
  }

  /* ---------- Liens ---------- */

  function construireLiens(p) {
    const ul = $('#e-liens');
    vider(ul);
    (p.liens || []).forEach((x) => ul.appendChild(ligneLien(x.url, x.titre)));
    if (!(p.liens || []).length) ul.appendChild(ligneLien('', ''));
  }

  function ligneLien(url, titre) {
    const li = document.createElement('li');
    const paire = creer('span', 'paire');
    const iu = document.createElement('input');
    iu.type = 'url';
    iu.placeholder = 'https://…';
    iu.value = url || '';
    iu.setAttribute('aria-label', 'Adresse du site');
    const it = document.createElement('input');
    it.type = 'text';
    it.placeholder = 'Intitulé (facultatif)';
    it.value = titre || '';
    it.maxLength = 120;
    it.setAttribute('aria-label', 'Intitulé du lien');
    [iu, it].forEach((c) => {
      c.addEventListener('input', planifierEcriture);
      c.addEventListener('change', ecrireMaintenant);
    });
    paire.appendChild(iu);
    paire.appendChild(it);
    const b = creer('button', null, '✕');
    b.type = 'button';
    b.setAttribute('aria-label', 'Retirer ce lien');
    b.addEventListener('click', () => {
      li.parentNode.removeChild(li);
      ecrireMaintenant();
    });
    li.appendChild(paire);
    li.appendChild(b);
    return li;
  }

  function lireLiens() {
    return $$('#e-liens li').map((li) => {
      const c = li.querySelectorAll('input');
      return { url: c[0].value.trim(), titre: c[1].value.trim() };
    }).filter((x) => x.url);
  }

  /* ---------- Photographies ---------- */

  function construireChoixProfil() {
    [['e-photo-profil', false], ['r-qualite', true]].forEach((paire) => {
      const el = $('#' + paire[0]);
      if (!el) return;
      if (!paire[1]) {
        vider(el);
        Object.keys(PHOTOS.PROFILS).forEach((k) => {
          const o = document.createElement('option');
          o.value = k;
          o.textContent = PHOTOS.PROFILS[k].nom;
          el.appendChild(o);
        });
        return;
      }
      /* Version détaillée des réglages : intitulé + explication + poids visé. */
      const legende = el.querySelector('legend');
      vider(el);
      if (legende) el.appendChild(legende);
      Object.keys(PHOTOS.PROFILS).forEach((k) => {
        const p = PHOTOS.PROFILS[k];
        const l = creer('label', 'radio');
        const r = document.createElement('input');
        r.type = 'radio';
        r.name = 'qualite';
        r.value = k;
        r.addEventListener('change', () => {
          S.reglages.qualitePhoto = k;
          $('#e-photo-profil').value = k;
          BASE.reglageEcrire('qualitePhoto', k);
        });
        const t = creer('span');
        t.appendChild(creer('strong', null, p.nom));
        t.appendChild(creer('small', null, ' ' + p.cote + ' px de côté — ' + p.aide));
        l.appendChild(r);
        l.appendChild(t);
        el.appendChild(l);
      });
    });
  }

  function chargerPhotosEditeur(id) {
    BASE.photosDuPoi(id).then((liste) => {
      if (S.editionId !== id) return;
      photosEditeur = liste;
      dessinerPhotosEditeur();
    });
  }

  function dessinerPhotosEditeur() {
    const g = $('#e-photos');
    EV.libererUrls('editeur');
    vider(g);
    photosEditeur.forEach((ph, i) => {
      const fig = document.createElement('figure');
      const im = document.createElement('img');
      im.alt = 'Photographie ' + (i + 1);
      im.src = EV.urlBlob(ph.vignette || ph.image, 'editeur');
      im.addEventListener('click', () => ouvrirVisionneuse(photosEditeur, i));
      fig.appendChild(im);
      if (i === 0) fig.appendChild(creer('figcaption', null, 'couverture'));

      const outils = creer('span', 'outils');
      const g1 = creer('button', null, '‹');
      g1.type = 'button';
      g1.title = 'Vers la gauche';
      g1.disabled = i === 0;
      g1.addEventListener('click', (e) => { e.stopPropagation(); deplacerPhoto(i, -1); });
      const d1 = creer('button', null, '›');
      d1.type = 'button';
      d1.title = 'Vers la droite';
      d1.disabled = i === photosEditeur.length - 1;
      d1.addEventListener('click', (e) => { e.stopPropagation(); deplacerPhoto(i, 1); });
      const s1 = creer('button', 'sup', '✕');
      s1.type = 'button';
      s1.title = 'Supprimer';
      s1.addEventListener('click', (e) => { e.stopPropagation(); supprimerPhoto(i); });
      outils.appendChild(g1);
      outils.appendChild(d1);
      outils.appendChild(s1);
      fig.appendChild(outils);
      g.appendChild(fig);
    });

    const n = photosEditeur.length;
    $('#e-photos-compte').textContent = n ? '— ' + n + ' sur ' + PHOTOS.MAX_PAR_POI : '';
    $('#e-photo-plus').disabled = n >= PHOTOS.MAX_PAR_POI;
    $('#e-photo-plus').textContent = n >= PHOTOS.MAX_PAR_POI
      ? 'Maximum atteint (' + PHOTOS.MAX_PAR_POI + ')' : '＋ Ajouter des photos';
  }

  function deplacerPhoto(i, sens) {
    const j = i + sens;
    if (j < 0 || j >= photosEditeur.length) return;
    const t = photosEditeur[i];
    photosEditeur[i] = photosEditeur[j];
    photosEditeur[j] = t;
    photosEditeur.forEach((p, k) => { p.ordre = k; });
    dessinerPhotosEditeur();
    BASE.photosReordonner(photosEditeur.map((p) => p.id))
      .then(() => EV.rechargerDonnees());
  }

  function supprimerPhoto(i) {
    const ph = photosEditeur[i];
    EV.confirmer('Supprimer cette photographie du carnet ? L\'original reste dans votre galerie.',
      'Supprimer').then((ok) => {
      if (!ok) return;
      BASE.photoSupprimer(ph.id).then(() => {
        photosEditeur.splice(i, 1);
        photosEditeur.forEach((p, k) => { p.ordre = k; });
        return BASE.photosReordonner(photosEditeur.map((p) => p.id));
      }).then(() => {
        dessinerPhotosEditeur();
        return EV.rechargerDonnees();
      });
    });
  }

  function ajouterPhotos(fichiers) {
    const id = S.editionId;
    if (!id || !fichiers || !fichiers.length) return;
    const reste = PHOTOS.MAX_PAR_POI - photosEditeur.length;
    if (reste <= 0) { EV.toast('Dix photographies au maximum par fiche.', true); return; }
    const liste = Array.prototype.slice.call(fichiers, 0, reste);
    const ignores = fichiers.length - liste.length;

    const etat = $('#e-photo-etat');
    etat.textContent = 'Préparation…';
    $('#e-photo-plus').disabled = true;

    let gagne = 0;
    PHOTOS.traiterPlusieurs(liste, S.reglages.qualitePhoto, (fait, total, nom) => {
      etat.textContent = 'Réduction ' + (fait + 1) + ' sur ' + total + ' — ' + nom;
    }).then((res) => {
      const depart = photosEditeur.length;
      const ajouts = res.resultats.map((r, k) => {
        gagne += Math.max(0, r.poidsOrigine - r.poids);
        return BASE.photoAjouter({
          poiId: id, ordre: depart + k,
          image: r.image, vignette: r.vignette,
          largeur: r.largeur, hauteur: r.hauteur,
          poids: r.poids, poidsOrigine: r.poidsOrigine,
          nomOrigine: r.nomOrigine, profil: r.profil,
          prise: r.prise || ''
        });
      });
      return Promise.all(ajouts).then(() => res);
    }).then((res) => {
      $('#e-photo-plus').disabled = false;
      const n = res.resultats.length;
      if (n) {
        etat.textContent = n + (n > 1 ? ' photos ajoutées' : ' photo ajoutée') +
          ' — ' + PHOTOS.formaterPoids(gagne) + ' économisés par la réduction.';
      } else {
        etat.textContent = '';
      }
      res.erreurs.forEach((e) => EV.toast(e.message, true));
      if (ignores > 0) EV.toast(ignores + ' photo(s) écartée(s) : dix au maximum par fiche.', true);
      /* Une photo géolocalisée peut recaler un point posé approximativement. */
      const avecGps = res.resultats.filter((r) => r.gps)[0];
      const p = S.parId[id];
      if (avecGps && p) proposerRecalage(p, avecGps);
      chargerPhotosEditeur(id);
      return EV.rechargerDonnees();
    }).catch((e) => {
      $('#e-photo-plus').disabled = false;
      etat.textContent = '';
      EV.toast(e.message || 'Ces photos n\'ont pas pu être ajoutées.', true);
    });
  }

  function proposerRecalage(p, r) {
    const d = EV.distance(p.lat, p.lon, r.gps.lat, r.gps.lon);
    if (d < 60) return;
    EV.confirmer('Cette photographie a été prise à ' + EV.formaterDistance(d) +
      ' du point actuel. Déplacer « ' + (p.nom || 'cette envie') + ' » à l\'endroit de la prise de vue ?',
      'Déplacer', true).then((ok) => {
      if (!ok) return;
      p.lat = r.gps.lat; p.lon = r.gps.lon;
      if (r.prise && !p.dateVisite) { p.dateVisite = r.prise; $('#e-date').value = r.prise; }
      BASE.poiEnregistrer(p).then(() => {
        majPosition(p);
        EV.rafraichirEpingle(p.id);
        EV.centrer(p.lat, p.lon);
        EV.toast('Point recalé sur la photographie.');
      });
    });
  }

  function supprimerPoi() {
    const p = poiEnEdition();
    if (!p) return;
    EV.confirmer('Supprimer « ' + (p.nom || 'cette envie') + ' », ses notes et ses photographies ? ' +
      'Cette action est définitive.', 'Supprimer').then((ok) => {
      if (!ok) return;
      const id = p.id;
      BASE.poiSupprimer(id).then(() => {
        S.editionId = null;
        S.ficheId = null;
        $('#editeur').hidden = true;
        $('#fiche').hidden = true;
        EV.toast('Envie supprimée.');
        return EV.rechargerDonnees();
      });
    });
  }

  /* ============================================================ Visionneuse */

  function ouvrirVisionneuse(liste, index) {
    visionneuse.urls.forEach((u) => URL.revokeObjectURL(u));
    visionneuse = { liste: liste, index: index, urls: [] };
    $('#visionneuse').hidden = false;
    montrerPhoto();
  }

  function montrerPhoto() {
    const ph = visionneuse.liste[visionneuse.index];
    if (!ph) return;
    const u = URL.createObjectURL(ph.image || ph.vignette);
    visionneuse.urls.push(u);
    $('#v-image').src = u;
    $('#v-image').alt = 'Photographie ' + (visionneuse.index + 1) + ' sur ' + visionneuse.liste.length;
    const bouts = [(visionneuse.index + 1) + ' / ' + visionneuse.liste.length];
    if (ph.largeur) bouts.push(ph.largeur + ' × ' + ph.hauteur + ' px');
    if (ph.poids) bouts.push(PHOTOS.formaterPoids(ph.poids));
    if (ph.poidsOrigine && ph.poidsOrigine > ph.poids) {
      bouts.push('original ' + PHOTOS.formaterPoids(ph.poidsOrigine));
    }
    $('#v-legende').textContent = bouts.filter(Boolean).join(' · ');
    $('#v-prec').hidden = visionneuse.liste.length < 2;
    $('#v-suiv').hidden = visionneuse.liste.length < 2;
  }

  function feuilleter(sens) {
    const n = visionneuse.liste.length;
    if (!n) return;
    visionneuse.index = (visionneuse.index + sens + n) % n;
    montrerPhoto();
  }

  function fermerVisionneuse() {
    $('#visionneuse').hidden = true;
    $('#v-image').removeAttribute('src');
    visionneuse.urls.forEach((u) => URL.revokeObjectURL(u));
    visionneuse.urls = [];
  }

  /* ============================================================== Câblage */

  function brancher() {
    construireGrilleCategories();
    construireCasesCategories();
    construireChoixProfil();

    $$('.filtres .segments button').forEach((b) => b.addEventListener('click', () => {
      S.filtre.statut = b.dataset.statut;
      $$('.filtres .segments button').forEach((x) => {
        x.classList.toggle('actif', x === b);
        x.setAttribute('aria-pressed', String(x === b));
      });
      rafraichirListe();
    }));

    $('#tri').addEventListener('change', () => {
      S.tri = $('#tri').value;
      if (S.tri === 'distance' && !S.position) EV.localiser();
      rafraichirListe();
    });

    $('#b-filtre-cat').addEventListener('click', () => {
      const z = $('#filtre-cat');
      z.hidden = !z.hidden;
      $('#b-filtre-cat').setAttribute('aria-expanded', String(!z.hidden));
    });
    $('#cat-tout').addEventListener('click', () => {
      $$('#cat-cases input').forEach((c) => { c.checked = true; });
      surChangementCategories();
    });
    $('#cat-rien').addEventListener('click', () => {
      $$('#cat-cases input').forEach((c) => { c.checked = false; });
      surChangementCategories();
    });

    $('#f-fermer').addEventListener('click', fermerFiche);
    $('#f-modifier').addEventListener('click', () => ouvrirEditeur(S.ficheId));
    $('#f-zoom').addEventListener('click', () => {
      const p = S.parId[S.ficheId];
      if (p) EV.centrer(p.lat, p.lon, 16);
    });
    $('#f-itineraire').addEventListener('click', (e) => {
      const p = S.parId[S.ficheId];
      if (p) EV.menuItineraire(e.currentTarget, [p], p.nom);
    });

    $('#e-fermer').addEventListener('click', fermerEditeur);
    $('#e-termine').addEventListener('click', fermerEditeur);
    ['#e-nom', '#e-notes', '#e-adresse', '#e-avis'].forEach((s) => {
      $(s).addEventListener('input', planifierEcriture);
      $(s).addEventListener('blur', ecrireMaintenant);
    });
    $('#e-date').addEventListener('change', ecrireMaintenant);
    $('#e-cat-actuel').addEventListener('click', () =>
      replierCategories(!$('#e-categories').hidden));
    $$('#e-statut button').forEach((b) =>
      b.addEventListener('click', () => choisirStatut(b.dataset.v)));
    $$('#e-etoiles button').forEach((b) =>
      b.addEventListener('click', () => choisirEtoiles(Number(b.dataset.n))));
    $('#e-lien-plus').addEventListener('click', () => {
      $('#e-liens').appendChild(ligneLien('', ''));
      $('#e-liens').lastChild.querySelector('input').focus();
    });
    $('#e-deplacer').addEventListener('click', deplacer);
    $('#e-supprimer').addEventListener('click', supprimerPoi);
    $('#e-photo-plus').addEventListener('click', () => $('#fichier-photos').click());
    $('#fichier-photos').addEventListener('change', (e) => {
      ajouterPhotos(e.target.files);
      e.target.value = '';
    });
    $('#e-photo-profil').addEventListener('change', (e) => {
      S.reglages.qualitePhoto = e.target.value;
      BASE.reglageEcrire('qualitePhoto', e.target.value);
      const r = document.querySelector('#r-qualite input[value="' + e.target.value + '"]');
      if (r) r.checked = true;
    });

    $('#v-fermer').addEventListener('click', fermerVisionneuse);
    $('#v-prec').addEventListener('click', () => feuilleter(-1));
    $('#v-suiv').addEventListener('click', () => feuilleter(1));
    $('#visionneuse').addEventListener('click', (e) => {
      if (e.target.id === 'visionneuse') fermerVisionneuse();
    });
  }

  EV.rafraichirListe = rafraichirListe;
  EV.ouvrirFiche = ouvrirFiche;
  EV.fermerFiche = fermerFiche;
  EV.ouvrirEditeur = ouvrirEditeur;
  EV.creerPoi = creerPoi;
  EV.ligneListe = ligneListe;
  EV.fermerVisionneuse = fermerVisionneuse;
  EV.brancherFiches = brancher;
  EV.construireCasesCategories = construireCasesCategories;

})(window.EV);

'use strict';
/*
 * Noyau : état partagé, carte, épingles, navigation, recherche, position.
 *
 * Les autres fichiers (fiches, circuits, reglages, demarrage) accrochent
 * leurs fonctions à l'objet EV défini ici. Pas de module ni de construction :
 * quatre balises <script> dans l'ordre, comme dans les autres applications de
 * ce dossier.
 */
window.EV = (function () {

  const VERSION = '1.1.0';

  /* ------------------------------------------------------------------ État */
  const S = {
    poi: [],
    parId: {},
    circuits: [],
    reglages: {},
    vignettes: {},
    comptes: {},
    marqueurs: {},
    vue: 'carte',
    filtre: { statut: 'tous', categories: null, q: '' },
    tri: 'recent',
    dernierChangement: '',
    position: null,
    ficheId: null,
    editionId: null,
    circuitAffiche: null,
    pointage: null
  };

  let carte = null;
  let coucheEpingles = null;
  let coucheCircuit = null;
  let marqueurMoi = null;
  let haloMoi = null;
  let epingleFantome = null;
  let fondsCarte = {};
  let fondActuel = null;
  let urlsVivantes = {};

  /* ------------------------------------------------------------ Utilitaires */

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.prototype.slice.call(document.querySelectorAll(s));

  function vider(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  function creer(balise, classe, texte) {
    const e = document.createElement(balise);
    if (classe) e.className = classe;
    if (texte != null) e.textContent = texte;
    return e;
  }

  let minuteurToast = null;
  function toast(message, alerte) {
    const t = $('#toast');
    t.textContent = message;
    t.classList.toggle('alerte', !!alerte);
    t.hidden = false;
    clearTimeout(minuteurToast);
    minuteurToast = setTimeout(() => { t.hidden = true; }, alerte ? 6000 : 3200);
  }

  /* Confirmation modale — renvoie une promesse. `window.confirm` bloque le fil
   * et, sur certains navigateurs mobiles installés en PWA, ne s'affiche pas.
   *
   * `doux` sert aux questions qui ne détruisent rien : c'est alors l'action
   * proposée qui reçoit le bouton plein, et non « Annuler ». Habiller une
   * suggestion utile comme une suppression apprend au lecteur à ne plus
   * regarder la couleur des boutons. */
  function confirmer(texte, libelle, doux) {
    const d = $('#confirmation');
    const bOui = $('#confirmation-oui');
    const bNon = $('#confirmation-non');
    $('#confirmation-texte').textContent = texte;
    bOui.textContent = libelle || 'Confirmer';
    bOui.classList.toggle('danger', !doux);
    bOui.classList.toggle('bouton-plein', !!doux);
    bNon.classList.toggle('bouton-plein', !doux);
    d.showModal();
    return new Promise((resoudre) => {
      const fin = (v) => {
        bOui.removeEventListener('click', surOui);
        bNon.removeEventListener('click', surNon);
        d.removeEventListener('cancel', surNon);
        d.close();
        resoudre(v);
      };
      const surOui = () => fin(true);
      const surNon = () => fin(false);
      bOui.addEventListener('click', surOui);
      bNon.addEventListener('click', surNon);
      d.addEventListener('cancel', surNon);
    });
  }

  /* Distance orthodromique, en mètres. */
  function distance(lat1, lon1, lat2, lon2) {
    const R = 6371000, r = Math.PI / 180;
    const dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function formaterDistance(m) {
    if (m == null) return '';
    if (m < 950) return Math.round(m / 10) * 10 + ' m';
    if (m < 100000) return (m / 1000).toFixed(1).replace('.', ',') + ' km';
    return Math.round(m / 1000) + ' km';
  }

  function formaterDate(iso) {
    if (!iso) return '';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    return m[3] + '/' + m[2] + '/' + m[1];
  }

  function etoilesTexte(n) {
    return '★★★'.slice(0, n) + '☆☆☆'.slice(0, 3 - n);
  }

  const MOTS_ETOILES = { 1: 'Bien — à revoir si on passe', 2: 'Remarquable — vaut le détour', 3: 'Exceptionnel — vaut le voyage' };

  /* Les URL saisies à la main arrivent souvent sans protocole. On complète en
   * http(s) uniquement : accepter « javascript: » serait ouvrir une porte. */
  function urlSure(u) {
    const t = String(u || '').trim();
    if (!t) return null;
    const complet = /^https?:\/\//i.test(t) ? t : 'https://' + t;
    try {
      const o = new URL(complet);
      return (o.protocol === 'http:' || o.protocol === 'https:') ? o.href : null;
    } catch (e) { return null; }
  }

  function ouvrirExterne(url) {
    const u = urlSure(url);
    if (!u) return;
    window.open(u, '_blank', 'noopener,noreferrer');
  }

  /* Les URL d'objet doivent être révoquées, sinon les blobs restent en mémoire
   * tant que l'onglet vit — dix photos par fiche, cela se voit vite.
   *
   * Elles sont rangées par zone d'affichage (liste, fiche, éditeur), et jamais
   * dans un seul tas : rafraîchir la liste révoquerait sinon les URL des
   * photos de la fiche ouverte à côté, qui deviendraient des cadres vides. */
  function urlBlob(blob, zone) {
    const u = URL.createObjectURL(blob);
    const z = zone || 'divers';
    (urlsVivantes[z] = urlsVivantes[z] || []).push(u);
    return u;
  }

  function libererUrls(zone) {
    const zones = zone ? [zone] : Object.keys(urlsVivantes);
    zones.forEach((z) => {
      (urlsVivantes[z] || []).forEach((u) => URL.revokeObjectURL(u));
      urlsVivantes[z] = [];
    });
  }

  function telecharger(blob, nom) {
    const a = document.createElement('a');
    const u = URL.createObjectURL(blob);
    a.href = u;
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  }

  /* ---------------------------------------------------- Menu contextuel léger */

  let menuOuvert = null;

  function menuContextuel(ancre, entrees) {
    fermerMenu();
    const m = creer('div');
    m.id = 'menu-contextuel';
    m.className = '';
    m.setAttribute('role', 'menu');
    entrees.forEach((e) => {
      const b = creer('button');
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.appendChild(creer('strong', null, e.titre));
      if (e.aide) b.appendChild(creer('small', null, e.aide));
      b.addEventListener('click', () => { fermerMenu(); e.action(); });
      m.appendChild(b);
    });
    /* Réutilise l'habillage du menu d'ajout plutôt que d'en styler un second. */
    m.className = 'menu-flottant';
    document.body.appendChild(m);
    placerMenu(m, ancre);
    menuOuvert = m;
    setTimeout(() => document.addEventListener('pointerdown', surClicDehors, true), 0);
  }

  function placerMenu(m, ancre) {
    const r = ancre.getBoundingClientRect();
    m.style.position = 'fixed';
    m.style.visibility = 'hidden';
    m.hidden = false;
    const h = m.offsetHeight, l = m.offsetWidth;
    let x = Math.min(r.left, window.innerWidth - l - 10);
    let y = r.bottom + 6;
    if (y + h > window.innerHeight - 10) y = Math.max(10, r.top - h - 6);
    m.style.left = Math.max(10, x) + 'px';
    m.style.top = y + 'px';
    m.style.visibility = 'visible';
  }

  function surClicDehors(e) {
    if (menuOuvert && menuOuvert.contains(e.target)) return;
    if ($('#menu-ajout') && !$('#menu-ajout').hidden && $('#menu-ajout').contains(e.target)) return;
    fermerMenu();
  }

  function fermerMenu() {
    document.removeEventListener('pointerdown', surClicDehors, true);
    if (menuOuvert && menuOuvert.parentNode) menuOuvert.parentNode.removeChild(menuOuvert);
    menuOuvert = null;
    const ma = $('#menu-ajout');
    if (ma) ma.hidden = true;
  }

  /* ------------------------------------------------------------------ Carte */

  const ATTRIB = '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © ' +
    '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> — données © ' +
    '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

  const CADRES = {
    france: [[41.2, -5.4], [51.3, 9.8]],
    europe: [[35.0, -11.0], [60.5, 31.0]]
  };

  function initCarte() {
    carte = L.map('carte', {
      zoomControl: true,
      attributionControl: true,
      minZoom: 3,
      maxZoom: 19,
      /* Le clic droit sert à poser une envie : le menu du navigateur gênerait. */
      contextmenu: false
    });
    carte.zoomControl.setPosition('topright');
    carte.fitBounds(CADRES.france);

    fondsCarte = {
      epure: () => L.maplibreGL({ style: 'https://tiles.openfreemap.org/styles/positron', attribution: ATTRIB }),
      plan: () => L.maplibreGL({ style: 'https://tiles.openfreemap.org/styles/liberty', attribution: ATTRIB }),
      vif: () => L.maplibreGL({ style: 'https://tiles.openfreemap.org/styles/bright', attribution: ATTRIB })
    };

    coucheEpingles = L.layerGroup().addTo(carte);
    coucheCircuit = L.layerGroup().addTo(carte);

    ajouterBoutonsCarte();

    carte.on('click', (e) => {
      if (S.pointage) return validerPointage(e.latlng);
      if (!estGrandEcran()) fermerTousPanneaux();
    });
    carte.on('contextmenu', (e) => {
      if (S.pointage) return validerPointage(e.latlng);
      proposerAjoutIci(e.latlng, e.originalEvent);
    });

    return carte;
  }

  function appliquerFond(cle) {
    const fabrique = fondsCarte[cle] || fondsCarte.epure;
    if (fondActuel) carte.removeLayer(fondActuel);
    fondActuel = fabrique();
    fondActuel.addTo(carte);
    /* Le fond doit rester sous les épingles et sous le tracé des circuits. */
    if (fondActuel.getContainer) {
      const c = fondActuel.getContainer();
      if (c && c.parentNode) c.parentNode.insertBefore(c, c.parentNode.firstChild);
    }
  }

  function ajouterBoutonsCarte() {
    const Bloc = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function () {
        const d = L.DomUtil.create('div', 'leaflet-bar');
        const b = L.DomUtil.create('a', 'bouton-carte', d);
        b.href = '#';
        b.id = 'b-position';
        b.title = 'Afficher ma position';
        b.setAttribute('role', 'button');
        b.textContent = '⊕';
        L.DomEvent.on(b, 'click', (e) => { L.DomEvent.stop(e); localiser(); });

        const c = L.DomUtil.create('a', 'bouton-carte', d);
        c.href = '#';
        c.id = 'b-cadrer';
        c.title = 'Cadrer sur mes envies';
        c.setAttribute('role', 'button');
        c.textContent = '⤢';
        L.DomEvent.on(c, 'click', (e) => { L.DomEvent.stop(e); cadrerSurTout(); });
        return d;
      }
    });
    carte.addControl(new Bloc());
  }

  function estGrandEcran() { return window.matchMedia('(min-width: 900px)').matches; }

  /* Marges de recadrage : sur ordinateur les panneaux recouvrent la carte,
   * un point centré « au milieu » finirait caché derrière. */
  function margesVue() {
    if (!estGrandEcran()) {
      /* La feuille basse mange jusqu'aux trois quarts de l'écran : sans en
       * tenir compte, un point « centré » se retrouve dessous. */
      const t = $('#tiroir');
      const couvert = (t && !t.hidden && !t.classList.contains('replie')) ? t.offsetHeight + 14 : 90;
      return { hg: [0, 14], bd: [0, couvert] };
    }
    const g = ($('#tiroir') && !$('#tiroir').hidden) ? $('#tiroir').offsetWidth : 0;
    const d = (($('#fiche') && !$('#fiche').hidden) ? $('#fiche').offsetWidth : 0) ||
      (($('#editeur') && !$('#editeur').hidden) ? $('#editeur').offsetWidth : 0);
    return { hg: [g + 20, 20], bd: [d + 20, 20] };
  }

  function centrer(lat, lon, zoom) {
    const m = margesVue();
    carte.flyTo([lat, lon], zoom || Math.max(carte.getZoom(), 13), { duration: 0.6 });
    /* Décale ensuite du demi-écart entre les deux panneaux, pour que le point
     * tombe au centre de la portion visible et non sous un panneau. */
    carte.once('moveend', () => {
      const dx = (m.hg[0] - m.bd[0]) / 2;
      if (Math.abs(dx) > 6) carte.panBy([-dx, 0], { animate: true });
    });
  }

  function cadrerSurTout() {
    const pts = S.poi.map((p) => [p.lat, p.lon]);
    if (!pts.length) { carte.fitBounds(CADRES.france); return; }
    const m = margesVue();
    carte.fitBounds(L.latLngBounds(pts).pad(0.12), {
      paddingTopLeft: m.hg, paddingBottomRight: m.bd, maxZoom: 15
    });
  }

  function cadreDepart() {
    const z = S.reglages.zoneDepart;
    if (z === 'tout' && S.poi.length) return cadrerSurTout();
    const m = margesVue();
    carte.fitBounds(CADRES[z] || CADRES.france, {
      paddingTopLeft: m.hg, paddingBottomRight: m.bd
    });
  }

  /* ---------------------------------------------------------------- Épingles */

  function icone(p, selectionnee) {
    return L.divIcon({
      className: 'epingle' + (selectionnee ? ' selectionnee' : ''),
      html: CAT.svgEpingle(p.categorie, { visite: p.statut === 'visite', etoiles: p.etoiles || 0 }),
      iconSize: [36, 47],
      iconAnchor: [18, 45],
      popupAnchor: [0, -42]
    });
  }

  function dessinerEpingles() {
    coucheEpingles.clearLayers();
    S.marqueurs = {};
    S.poi.forEach((p) => {
      if (!visibleSurCarte(p)) return;
      const m = L.marker([p.lat, p.lon], {
        icon: icone(p, p.id === S.ficheId),
        title: p.nom || 'Sans nom',
        riseOnHover: true,
        keyboard: true,
        alt: (p.nom || 'Sans nom') + ' — ' + CAT.nomDe(p.categorie)
      });
      m.on('click', () => EV.ouvrirFiche(p.id));
      m.addTo(coucheEpingles);
      S.marqueurs[p.id] = m;
    });
  }

  function visibleSurCarte(p) {
    if (p.statut === 'visite' && S.reglages.afficherVisitees === false) return false;
    if (p.statut === 'envie' && S.reglages.afficherEnvies === false) return false;
    if (S.filtre.categories && S.filtre.categories.indexOf(p.categorie) === -1) return false;
    return true;
  }

  function rafraichirEpingle(id) {
    const p = S.parId[id];
    const m = S.marqueurs[id];
    if (!p || !m) { dessinerEpingles(); return; }
    m.setLatLng([p.lat, p.lon]);
    m.setIcon(icone(p, id === S.ficheId));
  }

  function marquerSelection(id) {
    Object.keys(S.marqueurs).forEach((k) => {
      const p = S.parId[k];
      if (p) S.marqueurs[k].setIcon(icone(p, k === id));
    });
  }

  /* --------------------------------------------------------- Mode « pointer » */

  function demanderPoint(texte, action) {
    S.pointage = { action: action };
    $('#bandeau-texte').textContent = texte;
    $('#bandeau-pointage').hidden = false;
    document.body.classList.add('pointage');
    if (!estGrandEcran()) fermerTiroir();
    carte.getContainer().style.cursor = 'crosshair';
  }

  function annulerPointage() {
    S.pointage = null;
    $('#bandeau-pointage').hidden = true;
    document.body.classList.remove('pointage');
    carte.getContainer().style.cursor = '';
    if (epingleFantome) { carte.removeLayer(epingleFantome); epingleFantome = null; }
  }

  function validerPointage(latlng) {
    const a = S.pointage.action;
    annulerPointage();
    a(latlng.lat, latlng.lng);
  }

  function proposerAjoutIci(latlng, evenement) {
    const faux = { getBoundingClientRect: () => ({
      left: evenement ? evenement.clientX : 100, top: evenement ? evenement.clientY : 100,
      right: evenement ? evenement.clientX : 100, bottom: evenement ? evenement.clientY : 100,
      width: 0, height: 0
    }) };
    menuContextuel(faux, [
      { titre: 'Ajouter une envie ici', aide: 'Crée une fiche à cet endroit',
        action: () => EV.creerPoi(latlng.lat, latlng.lng) }
    ]);
  }

  /* ---------------------------------------------------------- Géolocalisation */

  function localiser() {
    if (!navigator.geolocation) { toast('Ce navigateur ne sait pas se localiser.', true); return; }
    toast('Recherche de votre position…');
    navigator.geolocation.getCurrentPosition((pos) => {
      S.position = {
        lat: pos.coords.latitude, lon: pos.coords.longitude,
        precision: pos.coords.accuracy || 0
      };
      afficherMoi();
      carte.flyTo([S.position.lat, S.position.lon], Math.max(carte.getZoom(), 12), { duration: 0.7 });
      toast('Position trouvée — précision ' + formaterDistance(S.position.precision) + '.');
      if (EV.rafraichirListe) EV.rafraichirListe();
      if (S.ficheId && EV.ouvrirFiche) EV.ouvrirFiche(S.ficheId, true);
    }, (err) => {
      const messages = {
        1: 'Localisation refusée. Autorisez-la dans les réglages du navigateur pour ce site, puis réessayez.',
        2: 'Position indisponible pour le moment.',
        3: 'La localisation a mis trop de temps à répondre.'
      };
      toast(messages[err.code] || 'Localisation impossible.', true);
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  }

  function afficherMoi() {
    if (!S.position) return;
    const ll = [S.position.lat, S.position.lon];
    if (!marqueurMoi) {
      haloMoi = L.circle(ll, { radius: S.position.precision || 30, className: 'moi-cercle',
        color: '#1f6fae', weight: 1.5, fillColor: '#1f6fae', fillOpacity: 0.13 }).addTo(carte);
      marqueurMoi = L.circleMarker(ll, { radius: 7, color: '#fff', weight: 3,
        fillColor: '#1f6fae', fillOpacity: 1 }).addTo(carte);
      marqueurMoi.bindTooltip('Vous êtes ici');
    } else {
      marqueurMoi.setLatLng(ll);
      haloMoi.setLatLng(ll).setRadius(S.position.precision || 30);
    }
    const b = document.getElementById('b-position');
    if (b) b.classList.add('actif');
  }

  function distanceDepuisMoi(p) {
    if (!S.position) return null;
    return distance(S.position.lat, S.position.lon, p.lat, p.lon);
  }

  function etatPermissionGeo() {
    if (!navigator.permissions || !navigator.permissions.query) return Promise.resolve('inconnue');
    return navigator.permissions.query({ name: 'geolocation' })
      .then((r) => ({ granted: 'accordée', denied: 'refusée', prompt: 'sera demandée' }[r.state] || r.state))
      .catch(() => 'inconnue');
  }

  /* ------------------------------------------------------------- Itinéraires */

  function lienItineraire(fournisseur, etapes) {
    const pts = etapes.map((e) => e.lat.toFixed(6) + ',' + e.lon.toFixed(6));
    if (!pts.length) return null;
    if (fournisseur === 'osm') {
      const depart = S.position ? S.position.lat.toFixed(6) + ',' + S.position.lon.toFixed(6) : '';
      const suite = (depart ? [depart] : []).concat(pts).join(';');
      return 'https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=' + encodeURIComponent(suite);
    }
    /* Google Maps : neuf points intermédiaires au maximum dans une URL. */
    const arrivee = pts[pts.length - 1];
    const intermediaires = pts.slice(0, -1).slice(0, 9);
    let u = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(arrivee) +
      '&travelmode=driving';
    if (intermediaires.length) u += '&waypoints=' + encodeURIComponent(intermediaires.join('|'));
    if (S.position) u += '&origin=' + encodeURIComponent(S.position.lat.toFixed(6) + ',' + S.position.lon.toFixed(6));
    return u;
  }

  function menuItineraire(ancre, etapes, nom) {
    const trop = etapes.length > 10;
    menuContextuel(ancre, [
      { titre: 'Ouvrir dans Google Maps',
        aide: trop ? 'Les 10 premières étapes seulement' : 'Itinéraire routier',
        action: () => ouvrirExterne(lienItineraire('google', etapes.slice(0, 10))) },
      { titre: 'Ouvrir dans OpenStreetMap', aide: 'Moteur libre OSRM',
        action: () => ouvrirExterne(lienItineraire('osm', etapes)) },
      { titre: 'Copier les coordonnées', aide: etapes.length > 1 ? 'Toutes les étapes' : 'Latitude, longitude',
        action: () => copier(etapes.map((e) => e.lat.toFixed(6) + ', ' + e.lon.toFixed(6)).join('\n'),
          nom || 'Coordonnées copiées.') }
    ]);
  }

  function copier(texte, message) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texte)
        .then(() => toast(message || 'Copié.'))
        .catch(() => toast('Copie impossible : ' + texte, true));
      return;
    }
    toast(texte);
  }

  /* ------------------------------------------------------------- Navigation */

  const VUES = { liste: '#vue-liste', circuits: '#vue-circuits', reglages: '#vue-reglages' };

  function allerA(vue) {
    fermerMenu();
    $$('#onglets button[data-vue]').forEach((b) => b.classList.toggle('actif', b.dataset.vue === vue));
    if (vue === 'carte') {
      S.vue = 'carte';
      fermerTiroir();
      return;
    }
    S.vue = vue;
    Object.keys(VUES).forEach((k) => { $(VUES[k]).hidden = k !== vue; });
    $('#tiroir').hidden = false;
    $('#tiroir').classList.remove('replie');
    if (vue === 'liste' && EV.rafraichirListe) EV.rafraichirListe();
    if (vue === 'circuits' && EV.rafraichirCircuits) EV.rafraichirCircuits();
    if (vue === 'reglages' && EV.rafraichirReglages) EV.rafraichirReglages();
    setTimeout(() => carte.invalidateSize({ pan: false }), 240);
  }

  function fermerTiroir() {
    $('#tiroir').hidden = true;
    $$('#onglets button[data-vue]').forEach((b) => b.classList.toggle('actif', b.dataset.vue === 'carte'));
    S.vue = 'carte';
    setTimeout(() => carte.invalidateSize({ pan: false }), 240);
  }

  function fermerTousPanneaux() {
    fermerTiroir();
    if (EV.fermerFiche) EV.fermerFiche();
  }

  /* -------------------------------------------------------------- Recherche */

  let suggestionsVisibles = [];

  function surRecherche() {
    const q = $('#q').value.trim();
    $('#q-vider').hidden = !q;
    S.filtre.q = q;
    if (S.vue === 'liste' && EV.rafraichirListe) EV.rafraichirListe();
    if (!q) { fermerSuggestions(); return; }
    afficherSuggestions(q);
  }

  function normaliser(t) {
    return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function afficherSuggestions(q) {
    const n = normaliser(q);
    const trouves = S.poi.filter((p) =>
      normaliser(p.nom).indexOf(n) !== -1 ||
      normaliser(p.adresse).indexOf(n) !== -1 ||
      normaliser(CAT.nomDe(p.categorie)).indexOf(n) !== -1).slice(0, 8);

    const ul = $('#suggestions');
    vider(ul);
    suggestionsVisibles = [];

    if (trouves.length) {
      ul.appendChild(creer('li', 'entete', 'Dans mon carnet'));
      trouves.forEach((p) => {
        const li = creer('li');
        li.setAttribute('role', 'option');
        const pastille = creer('span', 'pastille');
        pastille.style.setProperty('--fam', CAT.couleurDe(p.categorie));
        pastille.innerHTML = CAT.svgSymbole(p.categorie, 17);
        const txt = creer('span');
        txt.appendChild(creer('strong', null, p.nom || 'Sans nom'));
        txt.appendChild(creer('span', 'sec', CAT.nomDe(p.categorie) +
          (p.adresse ? ' — ' + p.adresse : '')));
        li.appendChild(pastille);
        li.appendChild(txt);
        li.addEventListener('click', () => {
          fermerSuggestions();
          $('#q').value = '';
          $('#q-vider').hidden = true;
          S.filtre.q = '';
          EV.ouvrirFiche(p.id);
        });
        ul.appendChild(li);
        suggestionsVisibles.push(li);
      });
    }

    /* La recherche de lieu n'est jamais lancée automatiquement : c'est le seul
     * moment où du texte quitte l'appareil, il doit rester délibéré. */
    ul.appendChild(creer('li', 'entete', 'Ailleurs'));
    const li = creer('li');
    li.setAttribute('role', 'option');
    const txt = creer('span');
    txt.appendChild(creer('strong', null, 'Chercher « ' + q +' » sur la carte'));
    txt.appendChild(creer('span', 'sec', 'Interroge Nominatim (OpenStreetMap)'));
    li.appendChild(creer('span', 'pastille', '⌕'));
    li.appendChild(txt);
    li.addEventListener('click', () => chercherLieu(q));
    ul.appendChild(li);
    suggestionsVisibles.push(li);

    ul.hidden = false;
    $('#q').setAttribute('aria-expanded', 'true');
  }

  function fermerSuggestions() {
    $('#suggestions').hidden = true;
    $('#q').setAttribute('aria-expanded', 'false');
  }

  let rechercheEnCours = false;

  function chercherLieu(q) {
    if (rechercheEnCours) return;
    rechercheEnCours = true;
    toast('Recherche de « ' + q + ' »…');
    const u = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&addressdetails=0' +
      '&accept-language=fr&q=' + encodeURIComponent(q);
    fetch(u, { headers: { Accept: 'application/json' } })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((liste) => {
        rechercheEnCours = false;
        if (!liste.length) { toast('Aucun lieu trouvé pour « ' + q + ' ».', true); return; }
        afficherResultatsLieux(liste);
      })
      .catch(() => {
        rechercheEnCours = false;
        toast('La recherche de lieu n\'a pas abouti — êtes-vous connecté ?', true);
      });
  }

  function afficherResultatsLieux(liste) {
    const ul = $('#suggestions');
    vider(ul);
    ul.appendChild(creer('li', 'entete', 'Lieux trouvés'));
    liste.forEach((r) => {
      const li = creer('li');
      li.setAttribute('role', 'option');
      const txt = creer('span');
      const nom = String(r.display_name || '').split(',')[0];
      txt.appendChild(creer('strong', null, nom));
      txt.appendChild(creer('span', 'sec', r.display_name || ''));
      li.appendChild(creer('span', 'pastille', '⌖'));
      li.appendChild(txt);
      li.addEventListener('click', () => {
        fermerSuggestions();
        const lat = parseFloat(r.lat), lon = parseFloat(r.lon);
        carte.flyTo([lat, lon], 14, { duration: 0.8 });
        menuApresLieu(nom, r.display_name, lat, lon);
      });
      ul.appendChild(li);
    });
    ul.hidden = false;
  }

  function menuApresLieu(nom, adresse, lat, lon) {
    const ancre = $('#q');
    menuContextuel(ancre, [
      { titre: 'Créer une envie ici', aide: nom,
        action: () => EV.creerPoi(lat, lon, { nom: nom, adresse: adresse }) },
      { titre: 'Seulement regarder', aide: 'Ne rien enregistrer', action: () => {} }
    ]);
  }

  /* ------------------------------------------------------------ Rechargement */

  function rechargerDonnees() {
    return Promise.all([
      BASE.poiTous(), BASE.circuitTous(), BASE.resumePhotos(), BASE.dernierEffacement()
    ]).then((r) => {
      S.poi = r[0];
      S.circuits = r[1];
      S.vignettes = r[2].vignettes;
      S.comptes = r[2].comptes;
      S.parId = {};
      S.poi.forEach((p) => { S.parId[p.id] = p; });
      /* Date du dernier mouvement du carnet, tous magasins confondus — une
       * suppression compte autant qu'une modification. */
      S.dernierChangement = [r[2].dernier, r[3]]
        .concat(S.poi.map(BASE.dateDe), S.circuits.map(BASE.dateDe))
        .reduce((m, d) => ((d || '') > m ? d : m), '');
      dessinerEpingles();
      majPastilleSauvegarde();
      if (EV.rafraichirListe) EV.rafraichirListe();
      if (EV.rafraichirCircuits) EV.rafraichirCircuits();
    });
  }

  /* ------------------------------------------------- Rappel de sauvegarde */

  const JOURS_AVANT_RAPPEL = 7;
  const POI_AVANT_RAPPEL = 3;

  /* Le carnet est-il à l'abri, et depuis quand ? `insiste` distingue le simple
   * constat — affiché dans les réglages, toujours — de l'alerte visible depuis
   * n'importe quel écran. Signaler le retard dès la première retouche ferait
   * du bruit sans rien apprendre : on attend qu'il y ait quelque chose à
   * perdre, et qu'un peu de temps ait passé. */
  function etatSauvegarde() {
    const derniere = S.reglages.derniereArchive || '';
    const change = S.dernierChangement || '';
    const vide = !S.poi.length && !S.circuits.length;
    const aJour = !!derniere && (!change || change <= derniere);
    const jours = derniere ? (Date.now() - Date.parse(derniere)) / 86400000 : Infinity;
    return {
      derniere: derniere, aJour: aJour, vide: vide, jours: jours,
      insiste: !vide && !aJour && S.poi.length >= POI_AVANT_RAPPEL && jours >= JOURS_AVANT_RAPPEL
    };
  }

  function majPastilleSauvegarde() {
    const b = document.querySelector('#onglets button[data-vue="reglages"]');
    if (!b) return;
    const e = etatSauvegarde();
    b.classList.toggle('a-signaler', e.insiste);
    b.setAttribute('aria-label', e.insiste
      ? 'Réglages — carnet non sauvegardé' : 'Réglages');
  }

  /* ------------------------------------------------------------------ Export */

  return {
    VERSION: VERSION, S: S,
    $: $, $$: $$, vider: vider, creer: creer,
    toast: toast, confirmer: confirmer,
    distance: distance, formaterDistance: formaterDistance, formaterDate: formaterDate,
    etoilesTexte: etoilesTexte, MOTS_ETOILES: MOTS_ETOILES,
    urlSure: urlSure, ouvrirExterne: ouvrirExterne,
    urlBlob: urlBlob, libererUrls: libererUrls, telecharger: telecharger,
    menuContextuel: menuContextuel, fermerMenu: fermerMenu,
    initCarte: initCarte, appliquerFond: appliquerFond, carte: () => carte,
    coucheCircuit: () => coucheCircuit,
    centrer: centrer, cadrerSurTout: cadrerSurTout, cadreDepart: cadreDepart,
    estGrandEcran: estGrandEcran, margesVue: margesVue,
    dessinerEpingles: dessinerEpingles, rafraichirEpingle: rafraichirEpingle,
    marquerSelection: marquerSelection,
    demanderPoint: demanderPoint, annulerPointage: annulerPointage,
    localiser: localiser, distanceDepuisMoi: distanceDepuisMoi, etatPermissionGeo: etatPermissionGeo,
    menuItineraire: menuItineraire, copier: copier,
    allerA: allerA, fermerTiroir: fermerTiroir, fermerTousPanneaux: fermerTousPanneaux,
    surRecherche: surRecherche, fermerSuggestions: fermerSuggestions, normaliser: normaliser,
    rechargerDonnees: rechargerDonnees,
    etatSauvegarde: etatSauvegarde, majPastilleSauvegarde: majPastilleSauvegarde
  };

})();

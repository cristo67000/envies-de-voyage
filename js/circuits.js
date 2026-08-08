'use strict';
/*
 * Circuits : regrouper des envies dans un ordre, les tracer, les transmettre.
 *
 * Le tracé affiché relie les étapes en ligne droite. Aucun calcul de route
 * n'est fait ici : il faudrait un moteur d'itinéraire, donc un service
 * extérieur interrogé à chaque modification, et une application qui ne
 * fonctionnerait plus hors ligne. Les distances annoncées sont donc « à vol
 * d'oiseau » — et le disent. Pour la route réelle, le bouton « Itinéraire »
 * passe la main à l'application de navigation, qui sait le faire.
 */
(function (EV) {

  const $ = EV.$, $$ = EV.$$, S = EV.S;
  const creer = EV.creer, vider = EV.vider;

  let courant = null;          /* circuit ouvert dans le panneau */
  let selection = [];          /* étapes cochées dans le sélecteur */

  /* ---------------------------------------------------------------- Liste */

  function rafraichirCircuits() {
    const ul = $('#circuits-liste');
    if (!ul) return;
    vider(ul);
    $('#circuits-vide').hidden = S.circuits.length !== 0;
    S.circuits.slice().sort((a, b) => (b.modifie || '').localeCompare(a.modifie || ''))
      .forEach((c) => {
        const li = creer('li', 'item');
        const past = creer('span', 'pastille');
        past.style.setProperty('--fam', c.couleur || '#55606e');
        past.textContent = '⤳';
        li.appendChild(past);
        const txt = creer('span', 'txt');
        txt.appendChild(creer('span', 'n', c.nom || 'Circuit sans nom'));
        const n = c.etapes.length;
        const d = longueur(c);
        txt.appendChild(creer('span', 's',
          n + (n > 1 ? ' étapes' : ' étape') + (d ? ' · ' + EV.formaterDistance(d) : '')));
        li.appendChild(txt);
        li.addEventListener('click', () => ouvrirCircuit(c.id));
        ul.appendChild(li);
      });
    if (courant) {
      const maj = S.circuits.filter((c) => c.id === courant.id)[0];
      if (maj) { courant = maj; dessinerDetail(); }
      else fermerDetail();
    }
  }

  function etapesDe(c) {
    return (c.etapes || []).map((id) => S.parId[id]).filter(Boolean);
  }

  function longueur(c) {
    const e = etapesDe(c);
    let t = 0;
    for (let i = 1; i < e.length; i++) t += EV.distance(e[i - 1].lat, e[i - 1].lon, e[i].lat, e[i].lon);
    return t;
  }

  /* --------------------------------------------------------------- Détail */

  function ouvrirCircuit(id) {
    const c = S.circuits.filter((x) => x.id === id)[0];
    if (!c) return;
    courant = c;
    /* Sur ordinateur la fiche et le circuit occupent le même emplacement à
     * droite : ouvrir l'un doit refermer l'autre, sans quoi le cadrage se
     * calcule sur une largeur qui change juste après. */
    EV.fermerFiche();
    EV.allerA('circuits');
    $('#circuits-liste-bloc').hidden = true;
    $('#circuit-detail').hidden = false;
    $('#c-nom').value = c.nom || '';
    $('#c-desc').value = c.description || '';
    $('#c-couleur').value = c.couleur || '#c2411f';
    dessinerDetail();
    tracer(c);
    cadrer(c);
  }

  function fermerDetail() {
    courant = null;
    $('#circuits-liste-bloc').hidden = false;
    $('#circuit-detail').hidden = true;
    effacerTrace();
    rafraichirCircuits();
  }

  function dessinerDetail() {
    if (!courant) return;
    const e = etapesDe(courant);
    const ul = $('#c-etapes');
    vider(ul);
    $('#c-vide').hidden = e.length !== 0;

    const d = longueur(courant);
    const visitees = e.filter((p) => p.statut === 'visite').length;
    $('#c-resume').textContent = e.length
      ? e.length + (e.length > 1 ? ' étapes' : ' étape') +
        ' · ' + EV.formaterDistance(d) + ' à vol d\'oiseau' +
        (visitees ? ' · ' + visitees + ' déjà vue' + (visitees > 1 ? 's' : '') : '')
      : '';

    e.forEach((p, i) => {
      const li = creer('li', 'item etape');
      li.appendChild(creer('span', 'rang', String(i + 1)));

      const past = creer('span', 'pastille');
      past.style.setProperty('--fam', CAT.couleurDe(p.categorie));
      past.innerHTML = CAT.svgSymbole(p.categorie, 17);
      li.appendChild(past);

      const txt = creer('span', 'txt');
      txt.appendChild(creer('span', 'n', p.nom || 'Sans nom'));
      /* Le sous-titre ne porte que la distance depuis l'étape précédente. Le
       * nom de catégorie y tiendrait mal : entre le rang, le symbole et les
       * trois commandes, la place restante coupait les noms de lieux — or
       * c'est le nom qu'on lit, la catégorie est déjà dans le symbole. */
      txt.appendChild(creer('span', 's', i === 0 ? 'départ'
        : '+ ' + EV.formaterDistance(EV.distance(e[i - 1].lat, e[i - 1].lon, p.lat, p.lon))));
      txt.addEventListener('click', () => EV.ouvrirFiche(p.id));
      li.appendChild(txt);

      const cmd = creer('span', 'cmd');
      const h = creer('button', null, '↑');
      h.type = 'button';
      h.title = 'Monter';
      h.disabled = i === 0;
      h.addEventListener('click', () => deplacerEtape(i, -1));
      const b = creer('button', null, '↓');
      b.type = 'button';
      b.title = 'Descendre';
      b.disabled = i === e.length - 1;
      b.addEventListener('click', () => deplacerEtape(i, 1));
      const x = creer('button', null, '✕');
      x.type = 'button';
      x.title = 'Retirer du circuit';
      x.addEventListener('click', () => retirerEtape(i));
      cmd.appendChild(h);
      cmd.appendChild(b);
      cmd.appendChild(x);
      li.appendChild(cmd);

      ul.appendChild(li);
    });
  }

  function enregistrerCourant() {
    if (!courant) return Promise.resolve();
    courant.nom = $('#c-nom').value.trim();
    courant.description = $('#c-desc').value;
    courant.couleur = $('#c-couleur').value;
    return BASE.circuitEnregistrer(courant).then(() => {
      tracer(courant);
      return EV.rechargerDonnees();
    });
  }

  function deplacerEtape(i, sens) {
    const j = i + sens;
    if (!courant || j < 0 || j >= courant.etapes.length) return;
    const t = courant.etapes[i];
    courant.etapes[i] = courant.etapes[j];
    courant.etapes[j] = t;
    dessinerDetail();
    BASE.circuitEnregistrer(courant).then(() => { tracer(courant); return EV.rechargerDonnees(); });
  }

  function retirerEtape(i) {
    if (!courant) return;
    courant.etapes.splice(i, 1);
    dessinerDetail();
    BASE.circuitEnregistrer(courant).then(() => { tracer(courant); return EV.rechargerDonnees(); });
  }

  /* Ordre par plus proche voisin depuis la première étape. Ce n'est pas la
   * solution optimale du problème du voyageur de commerce — la trouver
   * exactement coûte cher — mais sur une dizaine de points elle raccourcit
   * presque toujours nettement le trajet, et elle est instantanée. */
  function optimiser() {
    if (!courant || courant.etapes.length < 3) {
      EV.toast('Il faut au moins trois étapes pour qu\'un ordre se discute.');
      return;
    }
    const reste = etapesDe(courant);
    const avant = longueur(courant);
    const ordre = [reste.shift()];
    while (reste.length) {
      const dernier = ordre[ordre.length - 1];
      let meilleur = 0;
      let dm = Infinity;
      reste.forEach((p, k) => {
        const d = EV.distance(dernier.lat, dernier.lon, p.lat, p.lon);
        if (d < dm) { dm = d; meilleur = k; }
      });
      ordre.push(reste.splice(meilleur, 1)[0]);
    }
    courant.etapes = ordre.map((p) => p.id);
    const apres = longueur(courant);
    dessinerDetail();
    BASE.circuitEnregistrer(courant).then(() => {
      tracer(courant);
      const gain = avant - apres;
      EV.toast(gain > 100
        ? 'Ordre revu : ' + EV.formaterDistance(gain) + ' de moins qu\'avant.'
        : 'L\'ordre actuel était déjà le plus court, ou presque.');
      return EV.rechargerDonnees();
    });
  }

  function supprimerCircuit() {
    if (!courant) return;
    const nom = courant.nom || 'ce circuit';
    EV.confirmer('Supprimer « ' + nom + ' » ? Les envies qui le composent sont conservées.',
      'Supprimer').then((ok) => {
      if (!ok) return;
      const id = courant.id;
      BASE.circuitSupprimer(id).then(() => {
        fermerDetail();
        EV.toast('Circuit supprimé.');
        return EV.rechargerDonnees();
      });
    });
  }

  function nouveau() {
    const c = BASE.circuitNeuf({ nom: '' });
    BASE.circuitEnregistrer(c)
      .then(() => EV.rechargerDonnees())
      .then(() => {
        ouvrirCircuit(c.id);
        setTimeout(() => $('#c-nom').focus(), 120);
      });
  }

  /* ---------------------------------------------------------------- Tracé */

  function effacerTrace() {
    EV.coucheCircuit().clearLayers();
    S.circuitAffiche = null;
    EV.dessinerEpingles();
  }

  function tracer(c) {
    const couche = EV.coucheCircuit();
    couche.clearLayers();
    S.circuitAffiche = c ? c.id : null;
    if (!c) return;
    const e = etapesDe(c);
    if (e.length < 1) return;
    const pts = e.map((p) => [p.lat, p.lon]);
    const couleur = c.couleur || '#c2411f';
    if (pts.length > 1) {
      L.polyline(pts, { color: '#ffffff', weight: 8, opacity: 0.85, lineJoin: 'round' }).addTo(couche);
      L.polyline(pts, { color: couleur, weight: 4, opacity: 0.95, lineJoin: 'round',
        dashArray: '1 9', lineCap: 'round' }).addTo(couche);
      L.polyline(pts, { color: couleur, weight: 2.4, opacity: 0.75, lineJoin: 'round' }).addTo(couche);
    }
    /* Numéro d'étape posé à côté de l'épingle : sur un circuit, l'ordre est
     * l'information principale, et il ne se lit pas sur une ligne seule. */
    e.forEach((p, i) => {
      const m = L.marker([p.lat, p.lon], {
        icon: L.divIcon({
          className: 'etiquette-etape',
          html: '<span>' + (i + 1) + '</span>',
          iconSize: [22, 18],
          iconAnchor: [-6, 40]
        }),
        interactive: false,
        keyboard: false
      });
      m.addTo(couche);
      const el = m.getElement && m.getElement();
      if (el) el.style.setProperty('color', couleur);
    });
  }

  function cadrer(c) {
    const e = etapesDe(c);
    if (!e.length) return;
    const m = EV.margesVue();
    EV.carte().fitBounds(L.latLngBounds(e.map((p) => [p.lat, p.lon])).pad(0.15), {
      paddingTopLeft: m.hg, paddingBottomRight: m.bd, maxZoom: 14
    });
  }

  /* --------------------------------------------------- Sélecteur d'étapes */

  function ouvrirSelecteur() {
    if (!courant) return;
    selection = [];
    $('#ce-q').value = '';
    dessinerSelecteur();
    $('#choix-etapes').hidden = false;
  }

  function dessinerSelecteur() {
    const q = EV.normaliser($('#ce-q').value);
    const ul = $('#ce-liste');
    vider(ul);
    const dejaLa = courant ? courant.etapes : [];
    const liste = S.poi.filter((p) => {
      if (dejaLa.indexOf(p.id) !== -1) return false;
      if (!q) return true;
      return EV.normaliser(p.nom).indexOf(q) !== -1 ||
        EV.normaliser(p.adresse).indexOf(q) !== -1 ||
        EV.normaliser(CAT.nomDe(p.categorie)).indexOf(q) !== -1;
    }).sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr'));

    if (!liste.length) {
      ul.appendChild(creer('p', 'vide', dejaLa.length
        ? 'Toutes vos envies sont déjà dans ce circuit.'
        : 'Aucune envie ne correspond.'));
    }

    liste.forEach((p) => {
      const li = EV.ligneListe(p, { sansPhoto: true });
      const coche = creer('span', 'coche', '✓');
      li.insertBefore(coche, li.firstChild);
      li.classList.toggle('choisi', selection.indexOf(p.id) !== -1);
      li.addEventListener('click', () => {
        const k = selection.indexOf(p.id);
        if (k === -1) selection.push(p.id); else selection.splice(k, 1);
        li.classList.toggle('choisi', selection.indexOf(p.id) !== -1);
        majBoutonSelecteur();
      });
      ul.appendChild(li);
    });
    majBoutonSelecteur();
  }

  function majBoutonSelecteur() {
    const b = $('#ce-valider');
    b.disabled = selection.length === 0;
    b.textContent = selection.length
      ? 'Ajouter ' + selection.length + (selection.length > 1 ? ' étapes' : ' étape')
      : 'Ajouter au circuit';
  }

  function validerSelecteur() {
    if (!courant || !selection.length) return;
    courant.etapes = courant.etapes.concat(selection);
    $('#choix-etapes').hidden = true;
    dessinerDetail();
    BASE.circuitEnregistrer(courant).then(() => {
      tracer(courant);
      cadrer(courant);
      return EV.rechargerDonnees();
    });
  }

  /* ------------------------------------------------------------------ GPX */

  function echapper(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* Points de passage + une trace, pour que le fichier soit exploitable aussi
   * bien par un GPS de randonnée que par un logiciel de cartographie. */
  function versGpx(points, nomTrace) {
    const l = ['<?xml version="1.0" encoding="UTF-8"?>',
      '<gpx version="1.1" creator="Mes envies de voyage" xmlns="http://www.topografix.com/GPX/1/1">',
      '<metadata><name>' + echapper(nomTrace || 'Mes envies de voyage') + '</name>' +
      '<time>' + new Date().toISOString() + '</time></metadata>'];
    points.forEach((p) => {
      const desc = [CAT.nomDe(p.categorie), p.adresse, p.notes,
        p.statut === 'visite' ? 'Visité' + (p.etoiles ? ' — ' + '★'.repeat(p.etoiles) : '') : 'À voir',
        p.avis].filter(Boolean).join(' — ');
      l.push('<wpt lat="' + p.lat.toFixed(6) + '" lon="' + p.lon.toFixed(6) + '">' +
        '<name>' + echapper(p.nom || 'Sans nom') + '</name>' +
        '<desc>' + echapper(desc) + '</desc>' +
        '<sym>' + echapper(CAT.nomDe(p.categorie)) + '</sym></wpt>');
    });
    if (nomTrace && points.length > 1) {
      l.push('<trk><name>' + echapper(nomTrace) + '</name><trkseg>');
      points.forEach((p) => l.push('<trkpt lat="' + p.lat.toFixed(6) +
        '" lon="' + p.lon.toFixed(6) + '"></trkpt>'));
      l.push('</trkseg></trk>');
    }
    l.push('</gpx>');
    return l.join('\n');
  }

  function nomFichier(base) {
    return String(base || 'carnet').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'carnet';
  }

  function exporterGpx() {
    if (!courant) return;
    const e = etapesDe(courant);
    if (!e.length) { EV.toast('Ce circuit n\'a pas d\'étape à exporter.', true); return; }
    const nom = courant.nom || 'circuit';
    EV.telecharger(new Blob([versGpx(e, nom)], { type: 'application/gpx+xml' }),
      nomFichier(nom) + '.gpx');
    EV.toast('Fichier GPX enregistré.');
  }

  /* ------------------------------------------------------------- Câblage */

  function brancher() {
    $('#b-circuit-neuf').addEventListener('click', nouveau);
    $('#circuit-retour').addEventListener('click', fermerDetail);
    $('#c-nom').addEventListener('input', () => {
      clearTimeout(brancher.t);
      brancher.t = setTimeout(enregistrerCourant, 400);
    });
    $('#c-nom').addEventListener('blur', enregistrerCourant);
    $('#c-desc').addEventListener('blur', enregistrerCourant);
    $('#c-couleur').addEventListener('change', enregistrerCourant);
    $('#c-ajouter-etapes').addEventListener('click', ouvrirSelecteur);
    $('#c-optimiser').addEventListener('click', optimiser);
    $('#c-supprimer').addEventListener('click', supprimerCircuit);
    $('#c-gpx').addEventListener('click', exporterGpx);
    $('#c-itineraire').addEventListener('click', (e) => {
      if (!courant) return;
      const et = etapesDe(courant);
      if (!et.length) { EV.toast('Ce circuit n\'a pas d\'étape.', true); return; }
      EV.menuItineraire(e.currentTarget, et, courant.nom);
    });

    $('#ce-fermer').addEventListener('click', () => { $('#choix-etapes').hidden = true; });
    $('#ce-q').addEventListener('input', dessinerSelecteur);
    $('#ce-valider').addEventListener('click', validerSelecteur);
  }

  EV.rafraichirCircuits = rafraichirCircuits;
  EV.ouvrirCircuit = ouvrirCircuit;
  EV.effacerTraceCircuit = effacerTrace;
  EV.versGpx = versGpx;
  EV.nomFichier = nomFichier;
  EV.brancherCircuits = brancher;

})(window.EV);

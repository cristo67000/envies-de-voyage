'use strict';
/*
 * Démarrage : câblage de la barre, des onglets, du menu d'ajout, du clavier,
 * puis mise en route de la carte et du service worker.
 */
(function (EV) {

  const $ = EV.$, $$ = EV.$$, S = EV.S;

  /* ------------------------------------------------------- Menu « Ajouter » */

  function ouvrirMenuAjout(ancre) {
    const m = $('#menu-ajout');
    if (!m.hidden) { EV.fermerMenu(); return; }
    EV.fermerMenu();
    m.hidden = false;
    const r = ancre.getBoundingClientRect();
    m.style.position = 'fixed';
    m.style.visibility = 'hidden';
    const h = m.offsetHeight, l = m.offsetWidth;
    /* Sur téléphone la barre est en bas, sur ordinateur le rail est à gauche :
     * le menu se pose du côté où il y a la place. */
    let x = EV.estGrandEcran() ? r.right + 8 : Math.max(10, Math.min(r.left + r.width / 2 - l / 2,
      window.innerWidth - l - 10));
    let y = EV.estGrandEcran() ? Math.min(r.top, window.innerHeight - h - 12) : r.top - h - 10;
    if (y < 10) y = 10;
    if (x + l > window.innerWidth - 10) x = window.innerWidth - l - 10;
    m.style.left = x + 'px';
    m.style.top = y + 'px';
    m.style.visibility = 'visible';
    setTimeout(() => document.addEventListener('pointerdown', fermerSiDehors, true), 0);
  }

  function fermerSiDehors(e) {
    const m = $('#menu-ajout');
    if (m.contains(e.target)) return;
    document.removeEventListener('pointerdown', fermerSiDehors, true);
    m.hidden = true;
  }

  function lancerAjout(mode) {
    $('#menu-ajout').hidden = true;
    document.removeEventListener('pointerdown', fermerSiDehors, true);

    if (mode === 'pointer') {
      EV.demanderPoint('Touchez la carte à l\'endroit de votre envie.',
        (lat, lon) => EV.creerPoi(lat, lon));
      return;
    }
    if (mode === 'position') {
      if (!navigator.geolocation) { EV.toast('Ce navigateur ne sait pas se localiser.', true); return; }
      EV.toast('Recherche de votre position…');
      navigator.geolocation.getCurrentPosition((pos) => {
        S.position = { lat: pos.coords.latitude, lon: pos.coords.longitude,
          precision: pos.coords.accuracy || 0 };
        EV.creerPoi(pos.coords.latitude, pos.coords.longitude);
      }, () => EV.toast('Position indisponible — autorisez la localisation, ou placez le point à la main.', true),
        { enableHighAccuracy: true, timeout: 15000 });
      return;
    }
    if (mode === 'photo') { $('#fichier-photo-geo').click(); return; }
    if (mode === 'adresse') {
      EV.allerA('carte');
      $('#q').focus();
      EV.toast('Tapez le nom du lieu, puis choisissez « Chercher … sur la carte ».');
    }
  }

  /* Une photo prise sur place porte souvent ses coordonnées : c'est le moyen
   * le plus rapide de poser un point exact sans rien saisir. */
  function depuisPhoto(fichier) {
    if (!fichier) return;
    EV.toast('Lecture de la photographie…');
    PHOTOS.metadonnees(fichier).then((m) => {
      if (!m || !m.lisible) {
        EV.toast((m && m.message) || 'Cette image n\'a pas pu être lue.', true);
        return;
      }
      if (!m.gps) {
        EV.toast('Cette photographie ne contient pas de position GPS. ' +
          'Placez le point à la main, puis ajoutez-la depuis la fiche.', true);
        return;
      }
      const nom = String(fichier.name || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
      return EV.creerPoi(m.gps.lat, m.gps.lon, {
        nom: nom.length > 2 ? nom : '',
        dateVisite: m.prise || '',
        statut: m.prise ? 'visite' : 'envie'
      }).then(() => {
        EV.toast('Point posé à l\'endroit de la prise de vue.');
        /* La photo lue sert aussi de première image de la fiche. */
        const entree = $('#fichier-photos');
        const dt = new DataTransfer();
        dt.items.add(fichier);
        entree.files = dt.files;
        entree.dispatchEvent(new Event('change'));
      });
    }).catch(() => EV.toast('Cette image n\'a pas pu être lue.', true));
  }

  /* ------------------------------------------------------------- Clavier */

  function surTouche(e) {
    if (e.key !== 'Escape') return;
    if (!$('#visionneuse').hidden) { EV.fermerVisionneuse(); return; }
    if (S.pointage) { EV.annulerPointage(); return; }
    if (!$('#suggestions').hidden) { EV.fermerSuggestions(); return; }
    if (!$('#choix-etapes').hidden) { $('#choix-etapes').hidden = true; return; }
    if (!$('#editeur').hidden) { $('#e-fermer').click(); return; }
    if (!$('#fiche').hidden) { EV.fermerFiche(); return; }
    if (!$('#tiroir').hidden) { EV.fermerTiroir(); }
  }

  /* --------------------------------------------------- Rappel de sauvegarde */

  /* Un seul rappel, à l'ouverture, et seulement quand il y a de quoi perdre :
   * au moins trois envies, aucune archive depuis une semaine, et des
   * modifications depuis la dernière. Un message qui revient à chaque
   * lancement finit par ne plus être lu — et celui-ci doit l'être, puisque
   * personne d'autre ne détient ces données.
   *
   * Le stockage refusé par le navigateur (`persistant` faux) est un motif
   * distinct : les données peuvent alors disparaître d'elles-mêmes, et cela
   * mérite d'être dit même sur un carnet récemment exporté. */
  function rappelerSauvegarde(persistant) {
    const e = EV.etatSauvegarde();
    if (!persistant && S.poi.length > 1 && !e.aJour) {
      EV.toast('Ce navigateur n\'a pas garanti la conservation des données : ' +
        'exportez une archive depuis les réglages.', true);
      return;
    }
    if (!e.insiste) return;
    EV.toast(e.derniere
      ? 'Votre carnet a changé depuis la dernière archive. Réglages → Exporter.'
      : 'Votre carnet n\'existe que sur cet appareil. Réglages → Exporter mon carnet.');
  }

  /* ------------------------------------------------------- Service worker */

  function enregistrerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' &&
        location.hostname !== '127.0.0.1') return;
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  /* ---------------------------------------------------------- Mise en route */

  function demarrer() {
    $('#app-version').textContent = EV.VERSION;
    $('#app-version-2').textContent = EV.VERSION;

    /* Barre haute */
    $('#q').addEventListener('input', EV.surRecherche);
    $('#q').addEventListener('focus', () => { if ($('#q').value.trim()) EV.surRecherche(); });
    $('#q').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const premier = $('#suggestions li[role="option"]');
        if (premier) premier.click();
      }
    });
    $('#q-vider').addEventListener('click', () => {
      $('#q').value = '';
      $('#q-vider').hidden = true;
      S.filtre.q = '';
      EV.fermerSuggestions();
      if (EV.rafraichirListe) EV.rafraichirListe();
      $('#q').focus();
    });
    document.addEventListener('pointerdown', (e) => {
      if (!$('#bloc-recherche').contains(e.target)) EV.fermerSuggestions();
    });
    $('#b-apropos').addEventListener('click', () => $('#apropos').showModal());
    $('#apropos-fermer').addEventListener('click', () => $('#apropos').close());

    /* Onglets */
    $$('#onglets button[data-vue]').forEach((b) =>
      b.addEventListener('click', () => EV.allerA(b.dataset.vue)));
    $('#b-ajouter').addEventListener('click', (e) => ouvrirMenuAjout(e.currentTarget));
    $$('#menu-ajout button[data-mode]').forEach((b) =>
      b.addEventListener('click', () => lancerAjout(b.dataset.mode)));
    $('#fichier-photo-geo').addEventListener('change', (e) => {
      depuisPhoto(e.target.files[0]);
      e.target.value = '';
    });

    /* Tiroir : la poignée replie la feuille sans la fermer, pour garder la
     * liste sous la main tout en voyant la carte. */
    $$('[data-fermer-tiroir]').forEach((b) => b.addEventListener('click', EV.fermerTiroir));
    $('#tiroir-poignee').addEventListener('click', () => {
      $('#tiroir').classList.toggle('replie');
    });

    $('#bandeau-annuler').addEventListener('click', EV.annulerPointage);
    document.addEventListener('keydown', surTouche);
    window.addEventListener('resize', () => {
      EV.fermerMenu();
      const c = EV.carte();
      if (c) c.invalidateSize({ pan: false });
    });

    EV.brancherFiches();
    EV.brancherCircuits();
    EV.brancherReglages();

    return BASE.reglagesLire().then((r) => {
      S.reglages = r;
      EV.initCarte();
      EV.appliquerFond(r.fond);
      return EV.rechargerDonnees();
    }).then(() => {
      /* Sur grand écran, la liste est visible d'emblée : il y a la place, et
       * un carnet dont on ne voit pas le sommaire est un carnet qu'on oublie.
       * Sur téléphone la carte reste seule, l'écran est trop étroit.
       * Le panneau est ouvert AVANT le cadrage, pour que celui-ci sache
       * quelle portion de carte restera visible. */
      if (EV.estGrandEcran() && S.poi.length) EV.allerA('liste');
      EV.cadreDepart();
      EV.rafraichirReglages();
      return BASE.rendrePersistant();
    }).then((persistant) => {
      rappelerSauvegarde(persistant);
      enregistrerSW();
    }).catch((e) => {
      EV.toast('Le carnet n\'a pas pu s\'ouvrir : ' + (e.message || e), true);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', demarrer);
  } else {
    demarrer();
  }

})(window.EV);

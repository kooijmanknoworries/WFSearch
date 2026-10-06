import crypto from "node:crypto";
import http from "node:http";

const PORT = 8011;

const HTML = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>WordFeud Gallery</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,-apple-system,sans-serif;background:#f0f2f5;color:#1a1a2e;min-height:100vh;padding:2rem}
  .container{max-width:1200px;margin:0 auto}
  .header{text-align:center;margin-bottom:2rem}
  h1{font-size:1.8rem;margin-bottom:.25rem}
  .sub{color:#666;font-size:.9rem;margin-bottom:1rem}
  .search-box{max-width:600px;margin:0 auto 2rem}
  textarea{width:100%;height:120px;padding:.75rem 1rem;border:2px solid #dde;border-radius:8px;font-size:1rem;font-family:inherit;outline:none;resize:vertical;transition:border .2s}
  textarea:focus{border-color:#5b5}
  .select-row{display:flex;gap:.75rem;margin-top:.75rem;margin-bottom:.75rem}
  .cdd{flex:1;position:relative}
  .cdd-btn{padding:.75rem;border:2px solid #dde;border-radius:8px;font-size:1rem;font-family:inherit;background:#fff;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:.5rem}
  .cdd.open .cdd-btn,.cdd-btn:focus{border-color:#5b5;outline:none}
  .cdd-btn .cdd-label{flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#333}
  .cdd-btn .cdd-label.placeholder{color:#999}
  .cdd-btn .cdd-caret{color:#888;font-size:.8rem}
  .cdd-panel{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#fff;border:2px solid #dde;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.14);z-index:60;max-height:360px;display:flex;flex-direction:column;overflow:hidden}
  .cdd-panel[hidden]{display:none!important}
  .cdd-search-wrap{padding:.5rem;border-bottom:1px solid #eee}
  .cdd-search{width:100%;box-sizing:border-box;padding:.5rem .6rem;border:1px solid #dde;border-radius:6px;font-size:.9rem;font-family:inherit;outline:none}
  .cdd-search:focus{border-color:#5b5}
  .cdd-list{overflow-y:auto;max-height:300px;padding:.25rem 0}
  .cdd-group{padding:.45rem .9rem .2rem;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#999;position:sticky;top:0;background:#fff}
  .cdd-item{padding:.45rem .9rem;font-size:.95rem;cursor:pointer;color:#333}
  .cdd-item:hover{background:#f2f8f2}
  .btn-row{display:flex;gap:.75rem}
  button{flex:1;padding:.75rem;border:none;border-radius:8px;font-size:1rem;font-weight:600;cursor:pointer;transition:background .2s}
  #searchBtn{background:#4a4;color:#fff}
  #searchBtn:hover{background:#393}
  #searchBtn:disabled{opacity:.6;cursor:wait}
  #clearBtn{background:#e74c3c;color:#fff}
  #clearBtn:hover{background:#c0392b}
  .stats{text-align:center;color:#666;font-size:.9rem;margin-bottom:1rem}
  .gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1.5rem}
  .card{background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.06);overflow:hidden;text-align:center;transition:transform .2s;position:relative}
  .card:hover{transform:translateY(-2px)}
  .card .remove-btn{position:absolute;top:8px;right:8px;width:32px;height:32px;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;border:none;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s,background .2s}
  .card:hover .remove-btn{opacity:1}
  .card .remove-btn:hover{background:rgba(231,76,60,.9)}
  .card .invite-btn{position:absolute;top:8px;left:8px;padding:6px 10px;border-radius:6px;background:rgba(255,255,255,.92);color:#555;border:1px solid #ddd;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:4px;opacity:0;transition:opacity .2s,background .2s,color .2s}
  .card:hover .invite-btn{opacity:1}
  .card .invite-btn:hover{background:rgba(76,175,80,.12)}
  .card .invite-btn.invited{background:rgba(76,175,80,.15);color:#2e7d32;border-color:#4caf50;opacity:1}
  .card.invited{border:2px solid #4caf50}
  .card img{width:100%;aspect-ratio:1/1;object-fit:cover;display:block}
  .card .info{padding:1rem}
  .card .name{font-size:1.1rem;font-weight:700;margin-bottom:.25rem}
  .card .name.searched{color:#e74c3c}
  .cdd-item.searched{color:#e74c3c;font-weight:600}
  .lookup-bar{margin-top:.5rem;padding:.4rem .7rem;border-radius:6px;font-size:.85rem;display:flex;align-items:center;gap:.4rem;background:#eef;color:#335}
  .lookup-bar .mark{font-size:1rem}
  .card .id{color:#888;font-size:.8rem}
  .card .age{color:#4a4;font-size:.85rem;margin-top:.35rem;font-weight:600}
  .card .date{color:#999;font-size:.75rem;margin-top:.25rem}
  .empty{text-align:center;padding:3rem;color:#999;font-size:1.1rem}
  .toast{position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:.75rem 1.5rem;border-radius:8px;font-size:.9rem;opacity:0;transition:opacity .3s;pointer-events:none}
  .toast.show{opacity:1}
  .gallery-nav{display:flex;gap:.5rem;align-items:center;margin-top:1rem;flex-wrap:wrap;padding:.75rem;background:#f8f8f8;border-radius:8px}
  .gallery-nav input{padding:.4rem .6rem;border:1px solid #ddd;border-radius:6px;font-size:.85rem;flex:1;min-width:150px}
  .gallery-nav button{padding:.4rem .8rem;border:none;border-radius:6px;cursor:pointer;font-size:.8rem;font-weight:600}
  .gallery-list{display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.5rem}
  .gallery-chip{padding:.3rem .7rem;background:#e8e8e8;border-radius:20px;font-size:.8rem;cursor:pointer;display:flex;gap:.4rem;align-items:center}
  .gallery-chip:hover{background:#ddd}
  .gallery-chip.active{background:#4a4;color:#fff}
  .gallery-chip .del{color:#c44;font-weight:700;font-size:.9rem}
  .gallery-chip.active .del{color:#fcc}
  .search-banner{margin-top:1rem;padding:.75rem 1rem;border-radius:8px;font-size:.85rem;display:flex;gap:1rem;flex-wrap:wrap;align-items:center}
  .search-banner.ok{background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7}
  .search-banner.err{background:#ffebee;color:#c62828;border:1px solid #ef9a9a}
  .search-banner .stat{font-weight:600}
  .age-filter{display:flex;gap:.5rem;align-items:center;margin-top:.75rem;padding:.6rem .75rem;background:#fff8e1;border:1px solid #ffe082;border-radius:8px;flex-wrap:wrap}
  .age-filter label{font-size:.8rem;font-weight:600;color:#5d4037}
  .age-filter input{width:60px;padding:.3rem .4rem;border:1px solid #ddd;border-radius:4px;font-size:.8rem;text-align:center}
  .age-filter input:focus{outline:none;border-color:#4a4}
  .age-filter .toggle{font-size:.75rem;color:#888;margin-left:.5rem}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>🎯 WordFeud Gallery</h1>
    <p class="sub" id="subText">Zoek namen — stel max account leeftijd in hieronder</p>
  </div>
  <div class="search-box">
    <textarea id="names" placeholder="Plak namen hier (één per regel)&#10;bijv.&#10;Nico&#10;Suus1978&#10;Player123"></textarea>
    <div class="select-row">
      <div class="cdd" id="letterFilter">
        <div class="cdd-btn"><span class="cdd-label placeholder">Alle letters</span><span class="cdd-caret">▾</span></div>
        <div class="cdd-panel" hidden>
          <div class="cdd-search-wrap"><input class="cdd-search" placeholder="Filter namen..." /></div>
          <div class="cdd-list"></div>
        </div>
      </div>
      <div class="cdd" id="popularFilter">
        <div class="cdd-btn"><span class="cdd-label placeholder">Populaire namen (top 500)</span><span class="cdd-caret">▾</span></div>
        <div class="cdd-panel" hidden>
          <div class="cdd-search-wrap"><input class="cdd-search" placeholder="Filter namen..." /></div>
          <div class="cdd-list"></div>
        </div>
      </div>
    </div>
    <div class="lookup-bar" id="lookupBar" style="display:none"></div>
    <div class="btn-row">
      <button id="searchBtn">Zoek Alle</button>
      <button id="clearBtn">Wis Geschiedenis</button>
    </div>
    <div class="age-filter">
      <label>🔓 Max account leeftijd:</label>
      <input id="maxYears" type="number" min="0" max="50" value="2" /> <label>jaar</label>
      <input id="maxDays" type="number" min="0" max="3650" value="0" /> <label>dagen</label>
      <span class="toggle">(leeg = geen limiet)</span>
    </div>
  </div>
  <div class="search-banner" id="searchBanner" style="display:none"></div>
  <div class="gallery-nav" id="galleryNav">
    <input id="galleryName" placeholder="Galerijnaam..." />
    <button id="saveGalleryBtn" style="background:#4a4;color:#fff">💾 Opslaan</button>
    <button id="newGalleryBtn" style="background:#2196F3;color:#fff">➕ Nieuw</button>
  </div>
  <div class="gallery-list" id="galleryList"></div>
  <div class="stats" id="stats"></div>
  <div class="gallery" id="gallery"></div>
  <div class="empty" id="empty">Nog geen resultaten. Plak namen hierboven en klik op "Zoek Alle"</div>
</div>
<div class="toast" id="toast"></div>
<script>
const gallery = document.getElementById("gallery");
const stats = document.getElementById("stats");
const emptyMsg = document.getElementById("empty");
const toast = document.getElementById("toast");
const searchBtn = document.getElementById("searchBtn");
// Gallery management
const galleryListEl = document.getElementById("galleryList");
const galleryNameInput = document.getElementById("galleryName");
let galleries = JSON.parse(localStorage.getItem("wf_galleries") || "{}");
let currentGalleryKey = localStorage.getItem("wf_current_gallery") || "__current__";
function saveGalleriesMeta() { localStorage.setItem("wf_galleries", JSON.stringify(galleries)); }
function saveCurrentGallery() {
  localStorage.setItem("wf_" + currentGalleryKey, JSON.stringify(history));
  galleries[currentGalleryKey] = galleries[currentGalleryKey] || {};
  galleries[currentGalleryKey].count = history.length;
  galleries[currentGalleryKey].updated = Date.now();
  saveGalleriesMeta();
  rebuildInvitedNames();
  markMenuOptions();
}
// Invited tracking (global across all galleries)
let invitedSet = new Set(JSON.parse(localStorage.getItem("wf_invited") || "[]"));
let searchedSet = new Set(JSON.parse(localStorage.getItem("wf_searched") || "[]"));
function saveSearched() { localStorage.setItem("wf_searched", JSON.stringify(Array.from(searchedSet))); }
function normName(s) { return (s || "").trim().toLowerCase().replace(/\\s+/g, " "); }
// Base names of every player already saved in ANY gallery. These are the people
// you've already found, so menus mark them red. Rebuilt whenever a gallery changes.
let knownNames = new Set();
// A found username is its base plus a variation suffix (emma1978, emma_7, emma 12).
// Strip that trailing suffix to recover the base name the menus show.
function baseNameOf(username) {
  return normName(username).replace(/[_\\s\\-]*\\d{1,5}$/, "").trim();
}
function rebuildInvitedNames() {
  const s = new Set();
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.indexOf("wf_") === 0 && k !== "wf_invited" && k !== "wf_searched" && k !== "wf_galleries" && k !== "wf_current_gallery") {
      let arr;
      try { arr = JSON.parse(localStorage.getItem(k) || "[]"); } catch (e) { continue; }
      for (const u of arr) if (u && u.username) {
        const b = baseNameOf(u.username);
        if (b) s.add(b);
      }
    }
  }
  knownNames = s;
}
function isMarked(name) {
  const n = normName(name);
  if (!n) return false;
  return searchedSet.has(n) || knownNames.has(n);
}
function saveInvited() {
  localStorage.setItem("wf_invited", JSON.stringify([...invitedSet]));
  rebuildInvitedNames();
  markMenuOptions();
}
function loadCurrentGallery() { history = JSON.parse(localStorage.getItem("wf_" + currentGalleryKey) || "[]"); }
function setCurrentGallery(key) {
  saveCurrentGallery();
  currentGalleryKey = key;
  localStorage.setItem("wf_current_gallery", key);
  loadCurrentGallery();
  renderGallery();
  renderGalleryList();
}
function renderGalleryList() {
  galleryListEl.innerHTML = "";
  const currentName = currentGalleryKey === "__current__" ? "Sessie" : (galleries[currentGalleryKey] && galleries[currentGalleryKey].name ? galleries[currentGalleryKey].name : currentGalleryKey);
  const currentCount = currentGalleryKey === "__current__" ? history.length : (galleries[currentGalleryKey] ? galleries[currentGalleryKey].count : 0);
  const chip = document.createElement("div");
  chip.className = "gallery-chip active";
  chip.innerHTML = "<span>" + currentName + " (" + currentCount + ")</span>";
  if (currentGalleryKey !== "__current__") {
    chip.innerHTML += '<span class="del" data-key="' + currentGalleryKey + '">✕</span>';
    chip.addEventListener("click", function(e) {
      if (e.target.classList.contains("del")) {
        e.stopPropagation();
        const dk = e.target.getAttribute("data-key");
        localStorage.removeItem("wf_" + dk);
        delete galleries[dk];
        saveGalleriesMeta();
        currentGalleryKey = "__current__";
        localStorage.setItem("wf_current_gallery", "__current__");
        history = [];
        rebuildInvitedNames();
        markMenuOptions();
        renderGallery();
        renderGalleryList();
        showToast("Galerij verwijderd");
        return;
      }
    });
  }
  galleryListEl.appendChild(chip);
  Object.keys(galleries).forEach(function(key) {
    if (key === currentGalleryKey) return;
    const g = galleries[key];
    const c = document.createElement("div");
    c.className = "gallery-chip";
    c.innerHTML = "<span>" + (g.name || key) + " (" + (g.count || 0) + ")</span><span class='del' data-key='" + key + "'>✕</span>";
    c.addEventListener("click", function(e) {
      if (e.target.classList.contains("del")) {
        e.stopPropagation();
        var dk = e.target.getAttribute("data-key");
        localStorage.removeItem("wf_" + dk);
        delete galleries[dk];
        saveGalleriesMeta();
        rebuildInvitedNames();
        markMenuOptions();
        renderGalleryList();
        showToast("Galerij verwijderd");
        return;
      }
      setCurrentGallery(key);
      showToast("Galerij geladen");
    });
    galleryListEl.appendChild(c);
  });
}
let history = [];
loadCurrentGallery();

const dutchNames = {A:["Aafke", "Aagje", "Aaisey", "Aaltje", "Abby", "Ada", "Adagonda", "Adèle", "Adelheid", "Adeline", "Adelmund", "Adoree", "Adriënne", "Aemke", "Afelien", "Afra", "Aga", "Agaat", "Ageeth", "Aggy", "Aïcha", "Aïda", "Aiko", "Aily", "Aimée", "Aimy", "Ainoa", "Airlie", "Aisha", "Aiva", "Akelei", "Akke", "Akkelyn", "Alaia", "Alana", "Alaska", "Alba", "Albertine", "Aleid", "Aleida", "Aletta", "Alexa", "Alice", "Alie", "Alieke", "Alies", "Alivia", "Alix", "Alky", "Ally", "Alma", "Alouette", "Alyna", "Alyssa", "Amalia", "Amanda", "Amandine", "Amaury", "Amber", "Amberly", "Amelia", "Amélie", "Amely", "Amira", "Amra", "Amy", "Amy-Linn", "Ana", "Anaïs", "Andrea", "Andrée", "Andrieske", "Anemoon", "Angrée", "Anic", "Aniek", "Anje", "Anke", "Ankie", "Ankje", "Ann", "Anna", "Annabel", "Annalies", "Anne", "Annebel", "Annechien", "Annefleur", "Annejet", "Anne-Lieke", "Annelien", "Annelies", "Annelijn", "Anneloes", "Annelotte", "Anne-Lou", "Anne-marie", "Annemarieke", "Annemarije", "Anne-marije", "Annemarijn", "Annemiek", "Annemieke", "Annemijn", "Annerieke", "Anneska", "Annetje", "Annick", "Anny", "Anoek", "Anouk", "Ans", "Antje", "Aphrodite", "April", "Arenda", "Arianna", "Arieke", "Arjenne", "Arlette", "Aspen", "Aster", "Astrid", "Ata", "Aty", "Aukje", "Aurelia", "Aurélie", "Aurora", "Autumn", "Ava", "Avelin", "Aven", "Axelle", "Aya", "Ayla", "Aylin", "Ayska"],B:["Babbe", "Babette", "Babice", "Babs", "Baiba", "Barbara", "Bartina", "Bartje", "Baukelien", "Bea", "Beata", "Beate", "Beatrijs", "Beau", "Beaudine", "Beertje", "Belezza", "Belia", "Bella", "Belle", "Bente", "Bep", "Berbel", "Berber", "Berdien", "Bernadette", "Bernice", "Bernou", "Beryl", "Bess", "Beth", "Betsie", "Betsy", "Bettelien", "Bettine", "Betty-Sue", "Bianca", "Bibelotte", "Bibi", "Bibian", "Bila", "Billy", "Birger", "Birgit", "Birte", "Birthe", "Blizz", "Bloem", "Blossom", "Bo", "Bobbie", "Bobby", "Bodil", "Bodine", "Bonita", "Bowi", "Bracha", "Bre", "Brechje", "Brechtje", "Breeze", "Bregje", "Bregtje", "Brisa", "Britt", "Britte", "Brooklyn", "Brynn"],C:["Camille", "Cara", "Carice", "Carine", "Carlijn", "Carlijne", "Carlotta", "Carly", "Carmen", "Caro", "Carolien", "Carolijn", "Carys", "Casja", "Catelijn", "Catelijne", "Cathalijne", "Catharijne", "Cathelijn", "Cathelijne", "Cathleen", "Cato", "Catootje", "Ceci", "Cecile", "Cécilia", "Celeste", "Celine", "Cellistine", "Ceylin", "Chaja", "Chanel", "Chao", "Charlie", "Charu", "Chava", "Chibi", "Chireny", "Chloe", "Chrisje", "Christa", "Cicely", "Cilia", "Cilla", "Cilou", "Cisca", "Cita", "Claartje", "Claire", "Clara", "Clarisse", "Clary", "Clea", "Cleo", "Coby", "Colinda", "Coos", "Coosje", "Cor", "Cora", "Cornelieke", "Curille", "Cynthia"],D:["Dani", "Dalenne", "Dana", "Danae", "Dané", "Daniek", "Daniëlle", "Danique", "Daphne", "Date", "Davida", "Deborah", "Deenie", "Delphine", "Demi", "Denise", "Dessa", "Detje", "Deva", "Dewi", "Didy", "Diede", "Dieneke", "Dienke", "Dieuwertje", "Dimphy", "Dineke", "Dionne", "Dirckje", "Dirkje", "Dirre", "Ditte", "Diva", "Doeschka", "Dokus", "Dominique", "Door", "Doortje", "Dorende", "Dores", "Dorethé", "Doris", "Dorith", "Dorothea", "Dot", "Dottie", "Dounia", "Dounja", "Doutzen", "Duffy", "Dwarka", "Dymphy"],E:["Edie", "Edmée", "Eef", "Eefje", "Eefke", "Effie", "Egi", "Ela", "Elea", "Electra", "Elena", "Eleonora", "Elesta", "Elf", "Eliane", "Elieke", "Elin", "Eline", "Elisa", "Elise", "Elke", "Ella", "Elleke", "Ellemieke", "Ellemijn", "Ellen", "Ellerijn", "Elles", "Elly", "Ellineke", "Ellis", "Elmi", "Elodie", "Eloise", "Elsa / Elza", "Elsanne", "Elsbeth", "Else", "Elselien", "Elsemiek", "Elsemieke", "Elske", "Elzelien", "Em", "Emae", "Emanuelle", "Emi", "Emily", "Emma", "Emmarie", "Emmeke", "Emmelieke", "Emmelien", "Emy", "Enith", "Era", "Esmee", "Esra", "Estee", "Esther", "Eva", "Evangeline", "Evelien", "Evelijn", "Evelina", "Evi", "Evie"],F:["Fabienne", "Fae", "Faline", "Famke", "Faquita", "Fara", "Fardau", "Fay", "Faye", "Fee", "Felin", "Féliz", "Fem", "Femi", "Femke", "Fenna", "Fenne", "Fenneke", "Fiebe", "Fieke", "Fien", "Fiene", "Fientje", "Fiep", "Fiet", "Filippa", "Finelie", "Fiona", "Fiore", "Fleur", "Fleurtje", "Flin", "Flo", "Floor", "Floortje", "Flore", "Florence", "Floresté", "Florice", "Florieke", "Florine", "Fran", "Francis", "Francine", "Frauke", "Frederike", "Fredérique", "Frenchy", "Freya", "Frida", "Froukje", "Gabi", "Gabriëlle", "Gaby", "Gaia", "Gayatri", "Geena", "Geerke", "Geerte", "Geertje", "Geertrui", "Geertruida", "Geesje", "Geeske", "Geneviéve", "Geraldine", "Gerjanne", "Gerrieke", "Gerrita", "Gezina", "Gijsje", "Gilia", "Gina", "Gineke", "Ginger", "Ginie", "Gioia", "Gisela", "Giselle", "Gitta", "Gitte", "Gladys", "Godelieve", "Goedele", "Goeleke", "Golda", "Grace", "Greetje", "Greta", "Griet", "Grietje", "Guusje", "Gwen", "Gwendoline", "Gwenne", "Hailey", "Halo", "Hannah", "Hanne", "Hanneke", "Hansje", "Harleen", "Harmke", "Harper", "Harriette", "Hasse", "Hauke", "Haura", "Hava", "Havy", "Hayat", "Hayley", "Hazel", "Hazle", "Hea", "Heaven", "Hedwich", "Hedwig", "Heida", "Heidi", "Heike", "Heintje", "Heleen", "Héléna", "Hella", "Hendrieke", "Hendrika", "Hendrikje", "Hendrina", "Hera", "Hester", "Hetty", "Hilde", "Hildegard", "Hilgard", "Hilke", "Hilletje", "Hilly", "Hiske", "Holly", "Honey", "Honour", "Horacia", "Houkje", "Hulde", "Hyke"],I:["Ida", "Ieke", "Iemkje", "Ilja", "Ilona", "Ilse", "Imca", "Inde", "Indra", "Indy", "Ineke", "Ines", "Inge", "Ingeborg", "Ingelise", "Inia", "Inky", "Irine", "Iris", "Irma", "Irmgard", "Isa", "Ise", "Isis", "Isolde", "Itske", "Ivana", "Ivon", "Ivy", "Izem", "Izzy"],J:["Jace", "Jackie", "Jacobien", "Jacolien", "Jacoliene", "Jacomijn", "Jade", "Jana", "Janea", "Jane-Linn", "Janienke", "Janne", "Janneke", "Jannieke", "Jans", "Janske", "Jantien", "Jantina", "Jara", "Jasmijn", "Jasmin", "Jaylinn", "Jaynine", "Jazmin", "Jeanne", "Jefta", "Jeldau", "Jenneke", "Jenoa", "Jente", "Jeske", "Jess", "Jessie", "Jet", "Jetse", "Jetta", "Jette", "Jezzebelle", "Jikke", "Jill", "Jille", "Jinthe", "Jip", "Jiske", "Jitske", "Jitte", "Jo-Anne", "Jobke", "Jody", "Johanna", "Johanneke", "Jojanneke", "Jojo", "Joke", "Jolet", "Jolie", "Jolieke", "Jolien", "Jolijn", "Jonneke", "Joo", "Jools", "Joosje", "Jooske", "Jorie", "Jorieke", "Jos", "Josefien", "Josepha", "Josine", "Josje", "Jouke", "Joy", "Joya", "Joyann", "Joyce", "Juanita", "Judith", "Jule", "Julia", "Julie", "Juliënne", "Juliëtte", "Julinde", "Julinn", "June", "Juno", "Juulke", "Juultje"],K:["Kaat", "Kaate", "Kaatje", "Kady", "Kaeley", "Kaia", "Kalie", "Kara", "Karen", "Karina", "Karlien", "Karlijn", "Kate", "Katelijn", "Katniss", "Kato", "Katrien", "Katrijn", "Kaya", "Kayla", "Kaylee", "Kaylen", "Kaylinn", "Keesie", "Keet", "Keetje", "Keisha", "Keja", "Kelly", "Kelsey", "Kendra", "Kennedy", "Kensi", "Kerstin", "Khloé", "Kia", "Kiara", "Kickel", "Kiek", "Kiekie", "Kiki", "Kim", "Kimber", "Kimberley", "Kimé", "Kirsten", "Kjenta", "Klaartje", "Klaasje", "Klaske", "Klazina", "Koosje", "Kourtney", "Kris", "Krisje", "Kristie", "Kristien", "Kyara", "Kylie", "Kyra"],L:["Lana", "Lara", "Lauke", "Laura", "Lauren", "Laurie", "Laurien", "Layla", "Lea", "Leah", "Leandra", "Leentje", "Lena", "Lenneke", "Lenore", "Lente", "Leoba", "Léona", "Leonieke", "Leontien", "Leslie", "Letje", "Lette", "Lexi", "Lia", "Liane", "Lianne", "Lida", "Lidewij", "Lidia", "Lieke", "Liene", "Lieneke", "Lienke", "Lies", "Liesbeth", "Liese", "Lieske", "Lieve", "Lieveke", "Liliane", "Lilianne", "Lilly", "Limare", "Lina", "Linde", "Lineke", "Linn", "Linneke", "Lis", "Lisa", "Lisa-Marie", "Lise", "Lisea", "Liselot", "Lissy", "Lita", "Liv", "Liva", "Livay", "Livia", "Liz", "Liza", "Lize", "Lizee", "Lizet", "Lizz", "Lizzy", "Loalis", "Loe", "Loekie", "Loes", "Loesje", "Loga", "Lois", "Loiza", "Lola", "Lolly", "Lolo", "Lolu", "London", "Lonne", "Lonneke", "Lore", "Lorelay", "Loren", "Lori", "Lorijn", "Lotje", "Lotte", "Lotus", "Lou", "Loua", "Louise", "Loukie", "Loulou", "Lovie", "Lowieke", "Luana", "Lucie", "Lucy", "Lula", "Lulu", "Lumen", "Lumi", "Luna", "Luus", "Lux", "Lydia", "Lydie", "Lymée", "Lynn", "Lysbet", "Lyse", "Lyssa"],M:["Maaike", "Maan", "Maartje", "Maayke", "Machteld", "Madeleine", "Madelief", "Madelien", "Madelon", "Mae", "Maecy", "Maerle", "Magdalena", "Maie", "Maike", "Maja", "Malak", "Malin", "Malinda", "Mallory", "Malou", "Mare", "Mareike", "Maren", "Margje", "Margo", "Margot", "Margreet", "Margriet", "Maria", "Maribel", "Marie", "Marieke", "Marietje", "Marij", "Marija", "Marije", "Marijke", "Marijne", "Marijntje", "Marijse", "Marike", "Marinke", "Marit", "Marité", "Marjella", "Marjet", "Marjolein", "Marjoleine", "Marjolijn", "Marjonne", "Marley", "Marlieke", "Marlien", "Marlies", "Marlijn", "Marlijne", "Marloe", "Marloeke", "Marloes", "Marlotte", "Marni", "Marrigje", "Marthe", "Martine", "Martje", "Marysa", "Maryse", "Mascha", "Mathilde", "Matilda", "Matise", "Matje", "Maud", "Maureen", "Max", "Maxe", "May", "Maya", "Mayke", "Mayra", "Mechi", "Mechteld", "Megan", "Meike", "Meinke", "Merel", "Merete", "Merit", "Merle", "Metje", "Mette", "Michelle", "Michonne", "Mickey", "Miek", "Mieke", "Miep", "Mies", "Miesje", "Mignon", "Mijntje", "Mikky", "Mila", "Millie", "Milou", "Mimi", "Minke", "Minth", "Mirla", "Mirre", "Mirte", "Mitzi", "Mitzy", "Mona", "Moon", "Mouna", "Myra", "Myrthe", "Myrtille"],N:["Nya", "Nadya", "Naëma", "Naeva", "Nanda", "Nanet", "Nanna", "Naomi", "Naouel", "Neele", "Neeltje", "Néla", "Nele", "Nelke", "Nella", "Nelleke", "Nicky", "Nicole", "Nieke", "Niene", "Nienke", "Nikki", "Nimfa", "Nina", "Nine", "Ninette", "Ninke", "Ninte", "Niqui", "Noa", "Noani", "Noëmi", "Noï", "Nola", "Noleste", "Noor", "Noortje", "Nora", "Nore", "Norna", "Novèn", "Nynke"],O:["Oceane", "Oda", "Ode", "Odet", "Odile", "Odilia", "Ofra", "Olda", "Olga", "Oliva", "Olivia", "Oona", "Oonah", "Ophra", "Otilia", "Ottelien", "Otteline", "Ottoline", "Oukje"],P:["Paarl", "Pam", "Pamela", "Paradis", "Parel", "Paris", "Pascale", "Patrice", "Paula", "Pauleen", "Paulien", "Paulies", "Pearl", "Pebble", "Pebbles", "Peggy", "Pemme", "Penélope", "Pennie", "Pepita", "Pepper", "Phebe", "Phemi", "Phileine", "Phine", "Pia", "Pieke", "Pien", "Pier", "Pieta", "Pieternel", "Pietje", "Pietsje", "Pink", "Pip", "Pippa", "Pixie", "Pleun", "Pleuni", "Pleunie", "Pleuntje", "Plien", "Polly", "Poppy", "Presley", "Primrose", "Puck", "Puk"],Q:["Qianne", "Qiara", "Qiyara", "Queenie", "Quérine", "Questa", "Querida", "Qiëlle", "Quinta", "Quintijn", "Quinty", "Quirine", "Quirijn", "Quita"],R:["Rachel", "Rana", "Raquel", "Rebecca", "Reina", "Remy", "Rena", "Renate", "Renske", "Resi", "Réva", "Rhodé", "Rhona", "Rianne", "Richelle", "Richtje", "Riemke", "Rieneke", "Rientje", "Riet", "Rifka", "Rifke", "Rina", "Rineke", "Rinoa", "Rinske", "Rita", "Robby", "Robijn", "Robin", "Robyn", "Roelfke", "Roelie", "Roelien", "Roelinde", "Roeline", "Rohdé", "Rolien", "Romée", "Romijn", "Romy", "Roos", "Roosje", "Roosmarieke", "Roosmarijn", "Rori", "Rosa", "Rosalie", "Rosan", "Rose", "Rosea", "Rosei", "Roselien", "Rosemarije", "Rosemarijn", "Rosemijn", "Rosy", "Rox", "Roxanne", "Rozei", "Rozemarijn", "Rozemijn", "Ruby", "Ruta"],S:["Saar", "Saartje", "Sabien", "Sacha", "Sadé", "Sadie", "Sallie", "Sally", "Salome", "Sam", "Samantha", "Sammy", "Sanna", "Sanne", "Sanne-Fleur", "Sanneke", "Sanne-Lynn", "Sara", "Sarah", "Sarah-Jane", "Sarah-Sue", "Sasja", "Sasse", "Savannah", "Scarlett", "Scotty", "Selah", "Selma", "Selwyn", "Semmie", "Senna", "Senne", "Seya", "Shadé", "Shae-Lee", "Shanti", "Shauni", "Shea", "Sheila", "Shirin", "Shirley", "Sibel", "Sibelle", "Sibrich", "Sien", "Sienna", "Sientje", "Sifra", "Signe", "Sigrid", "Sija", "Silke", "Silvana", "Silvie", "Simone", "Simonetta", "Sina", "Siona", "Siske", "Sissi", "Sita", "Sjaan", "Sjoke", "Sjoukje", "Sjuul", "Sjuulke", "Snoes", "Soete", "Sofie", "Sofieke", "Sofietje", "Solane", "Solange", "Solen", "Somer", "Soof", "Sophie", "Sophieke", "Soraya", "Spencer", "Spring", "Stans", "Starlet", "Stefanie", "Steffie", "Stella", "Sterre", "Stien", "Stientje", "Stijnie", "Stijntje", "Stine", "Sue", "Sue-Ann", "Summer", "Sun", "Susan", "Suus", "Suusje", "Suzanne", "Suze", "Suzette", "Suzy", "Swaan", "Swaentje", "Syenne", "Sylke", "Sylvi", "Sylvie", "Syne", "Synthy", "Syta"],T:["Tabitha", "Talitha", "Tamar", "Tamara", "Tammy", "Tanneke", "Tara", "Tarva", "Taryn", "Teddy", "Teile", "Teresa", "Terri", "Tess", "Tessel", "Teunie", "Teunieke", "Teuntje", "Thalise", "Thaxa", "Thea", "Thijn", "Thya", "Thyrza", "Tia", "Tiara", "Tiemke", "Tiki", "Tilde", "Tina", "Tine", "Tineke", "Tischka", "Titia", "Tiya", "To", "Toma", "Tomika", "Toos", "Trees", "Trienke", "Trijntje", "Trix", "Trixie", "Trudi", "Trui", "Trynke", "Tyra"],U:["Ubele", "Udine", "Ukje", "Ulla", "Ursa", "Ursela", "Ursina", "Ursula", "Utske", "Uzuri"],V:["Vai", "Valeia", "Valencia", "Valentina", "Valerie", "Vanessa", "Varsha", "Veerle", "Velité", "Venne", "Vera", "Vere", "Verena", "Verle", "Veroniek", "Veronique", "Vicky", "Vida", "Vieve", "Vikki", "Vinthe", "Viola", "Virginia", "Vivi", "Vivian", "Vivianne", "Vivy", "Vlinder", "Volente", "Vonne", "Vronie"],W:["Wanda", "Waylinn", "Weia", "Welmoed", "Wencke", "Wende", "Wendela", "Wendelien", "Wendy", "Wenthe", "Wenxi", "Wesselien", "Wia", "Wibbrichje", "Wibeke", "Wica", "Widia", "Wieke", "Wieneke", "Wiep", "Wies", "Wiesje", "Wieske", "Wiet", "Wieteke", "Wietse", "Wijnanda", "Willa", "Willeke", "Willemein", "Willemieke", "Willemien", "Willemijn", "Willow", "Wilna", "Wimke", "Winnie", "Wira", "Wiska", "Wouke", "Wren", "Wytske"],X:["Xaja", "Xandi", "Xandra", "Xanou", "Xanthe", "Xanti", "Xantippe", "Xari", "Xavi", "Xaviera", "Xavy", "Xeleste", "Xemme", "Xena", "Xeni", "Xenia", "Xenne", "Xevera", "Xia", "Xi-Anne", "Xilla", "Xixi", "Xophia", "Xummer", "Xyza"],Y:["Yael", "Yara", "Yasmijn", "Yasmine", "Ybeltje", "Yda", "Yeh", "Yenne", "Yentl", "Yfke", "Yin", "Yinte/Yinthe", "Yitte", "Yiyi", "Yke", "Yldou", "Ylonka", "Ylva", "Yma", "Ymke", "Yoa", "Yoëlla", "Yohanna", "Yohna", "Yoia", "Yoka", "Yolanthe", "Yolein", "Yolenthe", "Yolet", "Yora", "Youna", "Yovanka", "Yoyo", "Yris", "Yrsa", "Ysabel", "Yuli", "Yuna", "Yvanca", "Yvette", "Yvon"],Z:["Zwanet", "Zanea", "Zanee", "Zanna", "Zara", "Zaviera", "Zaza", "Zazi", "Zazie", "Zazou", "Zé", "Zeia", "Zela", "Zélia", "Zélie", "Zéressa", "Zesla", "Zeva", "Zézette", "Zina", "Zinnia", "Zinzi", "Zita", "Zöe", "Zoey", "Zoleste", "Zon", "Zona", "Zonne", "Zophie", "Zora", "Zoraya", "Zosha", "Zowy", "ZsaZsa", "Zsuzsu", "Zus", "Zusa", "Zuse", "Zuzanna", "Zwaan", "Zwaantje", "Zyna", "Zyra", "Zyva"]};

// Top 500 popular Dutch female names (CBS data)
const popularNames=["Emma","Sophie","Julia","Olivia","Anna","Eva","Lotte","Noa","Lisa","Mila","Liliana","Lara","Lize","Els","Lien","Lies","Luna","Fleur","Esmee","Noor","Sanne","Lieke","Nora","Leah","Clara","Tess","Sara","Fenna","Lily","Mia","Nina","Eline","Larissa","Floortje","Alma","Maya","Laura","Iris","Juliette","Freya","Sofia","Isabella","Rosalie","Thea","Myrthe","Isa","Ruby","Eloise","Fien","Noortje","Rose","Elise","Megan","Florence","Juliana","Lynn","Alice","Charlotte","Julie","Madalina","Elodie","Yara","Evelien","Maeve","Marijn","Sylvie","Vivienne","Yasmine","Aaliyah","Abby","Ada","Adelheid","Adriana","Afra","Agaath","Agnes","Aileen","Aisha","Alanna","Aleida","Alette","Alexandra","Alicia","Alida","Aline","Alissa","Amalia","Amber","Amelia","Amina","Amira","Amy","Anastasia","Andrea","Angela","Angelique","Anique","Anita","Anja","Anke","Annabel","Anne","Anneke","Annelies","Annemarie","Annemieke","Annika","Anouk","Antonia","Ariane","Arwen","Ashley","Astrid","Aurora","Ava","Ayla","Aylin","Azra","Barbara","Bella","Bente","Benthe","Bernadette","Bertha","Bianca","Bibi","Bibian","Bo","Bodine","Bonnie","Brechtje","Bregje","Brenda","Britt","Brooke","Caitlin","Camille","Cara","Carlijn","Carmen","Carola","Caroline","Catharina","Cato","Cecile","Celeste","Celine","Chanel","Charissa","Charlie","Chelsea","Cheyenne","Chiara","Chloé","Christa","Christel","Christina","Cindy","Claire","Claudia","Cornelia","Cynthia","Dagmar","Daisy","Dana","Danielle","Danique","Daphne","Debbie","Deborah","Demi","Denise","Dewi","Diana","Diane","Dieuwertje","Dilara","Dina","Dionne","Dirkje","Donna","Doortje","Doris","Dorothea","Edith","Eefje","Eileen","Elena","Elif","Elin","Elisa","Elisabeth","Ella","Ellen","Elvira","Emilia","Emily","Emmy","Erica","Erin","Esra","Estelle","Esther","Eveline","Evi","Evie","Evy","Fabiënne","Fay","Faye","Febe","Felicia","Femke","Fenne","Fiene","Fiona","Flore","Frederique","Frida","Froukje","Gaby","Geertje","Geertruida","Gerda","Gerdien","Gina","Gisela","Greet","Greetje","Grietje","Guusje","Gwen","Gwendolyn","Hailey","Hanna","Hannah","Hanneke","Hannie","Harriët","Hedwig","Heidi","Heleen","Hendrika","Henriëtte","Hester","Hilda","Hilde","Ida","Ilana","Ilona","Ilse","Imke","Indy","Ines","Inge","Ingrid","Isabel","Isabelle","Ivana","Ivy","Izzy","Jacobine","Jacqueline","Jade","Jaimy","Jana","Janneke","Jannie","Jasmijn","Jasmine","Jeanette","Jeanine","Jeltje","Jennifer","Jenny","Jessica","Jet","Jette","Jikke","Jill","Jinte","Joanne","Johanna","Joke","Jolanda","Jolien","Jolijn","Joline","Joosje","Jorien","Josefien","Josephine","Joyce","Judith","June","Justine","Kaatje","Karen","Karin","Karina","Karlijn","Kate","Katinka","Katja","Katrien","Kayleigh","Kelly","Kiki","Kim","Kirsten","Klaartje","Krista","Kyra","Lana","Lauren","Lea","Leila","Lena","Lenie","Leonie","Lesley","Lianne","Lidewij","Liesbeth","Lieve","Lilian","Lina","Linda","Linde","Lindsay","Lisanne","Lisette","Liv","Loes","Lois","Lola","Lonneke","Louise","Lucia","Lucie","Valerie","Lydia","Maaike","Maartje","Machteld","Madelief","Madelon","Magda","Maja","Malou","Manon","Mara","Marga","Margot","Margreet","Margriet","Maria","Marieke","Mariëlle","Marije","Marijke","Marina","Marion","Marisa","Mariska","Marissa","Marit","Marjan","Marjolein","Marleen","Marlies","Marloes","Marta","Martine","Mary","Mathilde","Maud","Maxime","Mayra","Meike","Melanie","Melissa","Merel","Mette","Michelle","Mieke","Milou","Mina","Miriam","Mirjam","Mirte","Mirthe","Moniek","Monique","Nadia","Nadine","Naomi","Natalie","Nathalie","Neeltje","Nel","Nella","Nicole","Nienke","Nikita","Nikki","Norah","Nova","Nynke","Oda","Odette","Olga","Ophelia","Patricia","Paula","Pauline","Peggy","Petra","Philippine","Pien","Pip","Pleun","Pleuni","Priscilla","Puck","Quinty","Quirine","Rachel","Rebecca","Regina","Renate","Renée","Renske","Rianne","Riet","Rinske","Rita","Roos","Roosmarijn","Rosa","Rosanne","Roxanne","Ruth","Saar","Saartje","Sabine","Sabrina","Samantha","Sandra","Saskia","Selina","Selma","Senna","Shana","Shannon","Sharon","Sien","Sietske","Silke","Simone","Stefanie","Stella","Stephanie","Susanne","Suzan","Suzanne","Suze","Sylvia","Tamar","Tamara","Tanja","Tara","Tessa","Thirza","Tineke","Tirza","Tjitske","Trijntje","Truus","Ursula","Vanessa","Veerle","Vera","Veronica","Victoria","Vivianne","Wanda","Wendy","Wieke","Wies","Wietske","Wilhelmina","Willeke","Willemijn","Wilma","Xanthe","Xenia","Yasmin","Yentl","Yfke","Ymke","Yvette","Yvonne","Zara","Zeynep","Zita","Zoë"];

// Precomputed set of every name that appears in either menu (normalized)
const menuNames = new Set([...Object.values(dutchNames).flat(), ...popularNames].map(normName));
function inMenu(name) {
  return menuNames.has(normName(name));
}

// Custom dropdown (replaces native <select>) so item text can be colored red.
// Exposes .value and fires a "change" event so existing search/filter logic is untouched.
class CustomDropdown {
  constructor(root, placeholder, groups, opts) {
    this.root = root;
    this.btn = root.querySelector(".cdd-btn");
    this.labelEl = root.querySelector(".cdd-label");
    this.panel = root.querySelector(".cdd-panel");
    this.search = root.querySelector(".cdd-search");
    this.list = root.querySelector(".cdd-list");
    this.placeholder = placeholder;
    this.groups = groups;
    this.value = "";
    this.onChange = opts && opts.onChange || null;
    this._filter = "";
    this._itemEls = [];
    this._renderAll();
    this._bind();
    this.refresh();
  }
  _renderAll() {
    this.list.innerHTML = "";
    this._itemEls = [];
    const frag = document.createDocumentFragment();
    this.groups.forEach(g => {
      if (g.label) {
        const h = document.createElement("div");
        h.className = "cdd-group";
        h.textContent = g.label;
        frag.appendChild(h);
      }
      g.items.forEach(name => {
        const it = document.createElement("div");
        it.className = "cdd-item";
        it.textContent = name;
        it.dataset.norm = normName(name);
        it.dataset.value = name;
        it.addEventListener("click", () => this._select(name));
        frag.appendChild(it);
        this._itemEls.push(it);
      });
    });
    this.list.appendChild(frag);
  }
  _select(name) {
    if (name.indexOf("✕") === 0) { this._reset(); return; } // clear item
    this.value = name;
    this.labelEl.textContent = name;
    this.labelEl.classList.remove("placeholder");
    this._close();
    if (this.onChange) this.onChange(name);
    this.root.dispatchEvent(new Event("change"));
  }
  _reset() {
    this.value = "";
    this.labelEl.textContent = this.placeholder;
    this.labelEl.classList.add("placeholder");
    this._close();
    this.root.dispatchEvent(new Event("change"));
  }
  _open() {
    this.panel.hidden = false;
    this.root.classList.add("open");
    this._filter = "";
    if (this.search) { this.search.value = ""; this._applyFilter(""); }
    this.refresh();
    if (this.search) setTimeout(() => this.search.focus(), 0);
  }
  _close() { this.panel.hidden = true; this.root.classList.remove("open"); }
  _applyFilter(q) {
    q = q.toLowerCase();
    this._itemEls.forEach(el => {
      const show = !q || el.dataset.norm.indexOf(q) !== -1;
      el.style.display = show ? "" : "none";
    });
    this.list.querySelectorAll(".cdd-group").forEach(h => {
      let n = h.nextElementSibling, any = false;
      while (n && !n.classList.contains("cdd-group")) {
        if (n.style.display !== "none") { any = true; break; }
        n = n.nextElementSibling;
      }
      h.style.display = any ? "" : "none";
    });
  }
  refresh() {
    this._itemEls.forEach(el => el.classList.toggle("searched", isMarked(el.dataset.value)));
  }
  _bind() {
    this.btn.addEventListener("click", e => {
      e.stopPropagation();
      if (this.panel.hidden) this._open(); else this._close();
    });
    if (this.search) {
      this.search.addEventListener("input", () => this._applyFilter(this.search.value));
      this.search.addEventListener("click", e => e.stopPropagation());
      this.search.addEventListener("keydown", e => {
        if (e.key === "Escape") this._close();
        if (e.key === "Enter") { e.preventDefault(); const f = this._itemEls.find(el => el.style.display !== "none" && el.dataset.norm === this._filter); if (f) f.click(); }
      });
    }
    this.list.addEventListener("scroll", () => {});
  }
}
document.addEventListener("click", e => {
  // Only close when the click is truly outside a dropdown; typing in the
  // filter box or clicking an item must not dismiss the menu.
  if (e.target && e.target.closest && e.target.closest(".cdd")) return;
  document.querySelectorAll(".cdd.open").forEach(el => { el.classList.remove("open"); const p = el.querySelector(".cdd-panel"); if (p) p.hidden = true; });
});

const letterDropdown = new CustomDropdown(document.getElementById("letterFilter"), "Alle letters",
  Object.keys(dutchNames).map(letter => ({
    label: letter + " (" + dutchNames[letter].length + ")",
    items: ["✕ Wis keuze"].concat(dutchNames[letter])
  })), { onChange: null });
const popularDropdown = new CustomDropdown(document.getElementById("popularFilter"), "Populaire namen (top 500)",
  [{ label: "", items: popularNames }], { onChange: null });

// Color dropdown items for names already searched or uitgenodigd.
// Guarded: may be called from saveCurrentGallery() during init, before the menus exist.
function markMenuOptions() {
  try { letterDropdown.refresh(); } catch (e) {}
  try { popularDropdown.refresh(); } catch (e) {}
}
function updateLookupBar() {
  const bar = document.getElementById("lookupBar");
  const val = document.getElementById("names").value.trim();
  if (!val) { bar.style.display = "none"; return; }
  const lines = val.split("\\n").map(s => s.trim()).filter(Boolean);
  const unique = Array.from(new Set(lines.map(normName)));
  bar.style.display = "flex";
  bar.innerHTML = unique.map(n => {
    const found = isMarked(n);
    const inM = inMenu(n);
    const mark = found ? "🔴" : (inM ? "🔵" : "⚪");
    const cls = found ? "color:#c62828;font-weight:700" : "color:#445";
    return '<span style="' + cls + '">' + mark + ' ' + n + '</span>';
  }).join(" ");
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}

function getAgeLimit() {
  const years = parseInt(document.getElementById("maxYears").value) || 0;
  const days = parseInt(document.getElementById("maxDays").value) || 0;
  return years * 365 + days;
}

function formatAge(createdTs) {
  if (!createdTs) return null;
  const days = Math.floor((Date.now() - createdTs * 1000) / 86400000);
  const years = Math.floor(days / 365);
  const limit = getAgeLimit();
  if (limit > 0 && days >= limit) return null;
  if (years > 0) return "Speelt al " + years + " jaar";
  return "Speelt al " + days + " dagen";
}

function formatDate(ts) {
  return new Date(ts * 1000).toLocaleDateString("nl-NL");
}

function renderCard(user) {
  const card = document.createElement("div");
  card.className = "card" + (invitedSet.has(user.id) ? " invited" : "");
  const btn = document.createElement("button");
  btn.className = "remove-btn";
  btn.textContent = "✕";
  btn.onclick = () => removeUser(user.id, card);
  const inviteBtn = document.createElement("button");
  inviteBtn.className = "invite-btn" + (invitedSet.has(user.id) ? " invited" : "");
  inviteBtn.textContent = invitedSet.has(user.id) ? "✓ Uitgenodigd" : "📨";
  inviteBtn.title = invitedSet.has(user.id) ? "Uitgenodigd" : "Markeer als uitgenodigd";
  inviteBtn.onclick = () => toggleInvite(user.id, card, inviteBtn);
  card.innerHTML =
    '<img src="/avatar/' + user.id + '" alt="' + user.username + '" />' +
    '<div class="info">' +
    '<div class="name' + (isMarked(user.username) ? ' searched' : '') + '">' + user.username + '</div>' +
    '<div class="id">ID: ' + user.id + '</div>' +
    '<div class="age">' + formatAge(user.created) + '</div>' +
    '<div class="date">Sinds ' + formatDate(user.created) + '</div>' +
    '</div>';
  card.insertBefore(btn, card.firstChild);
  card.insertBefore(inviteBtn, card.childNodes[1]);
  const img = card.querySelector("img");
  img.onerror = function() {
    this.src = "data:image/svg+xml," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">' +
      '<rect width="256" height="256" fill="#eee"/>' +
      '<text x="128" y="140" text-anchor="middle" font-size="40" fill="#bbb">?</text></svg>');
  };
  return card;
}

function toggleInvite(userId, card, btn) {
  if (invitedSet.has(userId)) {
    invitedSet.delete(userId);
    card.classList.remove("invited");
    btn.classList.remove("invited");
    btn.textContent = "📨";
    btn.title = "Markeer als uitgenodigd";
  } else {
    invitedSet.add(userId);
    card.classList.add("invited");
    btn.classList.add("invited");
    btn.textContent = "✓ Uitgenodigd";
    btn.title = "Uitgenodigd";
  }
  saveInvited();
}

function removeUser(userId, card) {
  history = history.filter(u => u.id !== userId);
  saveCurrentGallery();
  card.remove();
  updateStats();
}

function updateStats() {
  if (history.length === 0) {
    emptyMsg.style.display = "block";
    gallery.style.display = "none";
    stats.textContent = "";
  } else {
    emptyMsg.style.display = "none";
    gallery.style.display = "grid";
    stats.textContent = history.length + " speler" + (history.length !== 1 ? "s" : "") + " in galerij";
  }
}

function getFilterLetter() {
  const val = letterDropdown.value;
  // If dropdown has a full name (from optgroup), extract first letter
  if (val && val.length > 1) {
    return val.charAt(0).toUpperCase();
  }
  return val;
}

function renderGallery() {
  gallery.innerHTML = "";
  const letter = getFilterLetter();
  let filtered = history;
  if (letter) {
    filtered = history.filter(u => u.username.charAt(0).toUpperCase() === letter);
  }
  if (filtered.length === 0) {
    emptyMsg.style.display = "block";
    stats.textContent = letter ? "Geen resultaten voor '" + letter + "'" : "";
    return;
  }
  emptyMsg.style.display = "none";
  filtered.forEach(u => gallery.appendChild(renderCard(u)));
  updateStats();
}



let lastApiError = null;
async function searchUser(username) {
  try {
    const res = await fetch("/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    });
    const data = await res.json();
    if (!data.ok) {
      lastApiError = data.message || "API error";
      return -2;
    }
    if (data.results && data.results.length > 0) {
      const u = data.results[0];
      const age = formatAge(u.created);
      if (age !== null) {
        if (!history.find(h => h.id === u.id)) {
          history.push(u);
          saveCurrentGallery();
        }
        searchedSet.add(normName(u.username));
        saveSearched();
        markMenuOptions();
        return 1;
      }
      return -1;
    }
  } catch(e) {
    lastApiError = "Network error";
    return -2;
  }
  return 0;
}

function generateVariations(name) {
  const variations = new Set();
  const separators = ["", " ", "_", "#", "-"];
  // Base name
  variations.add(name);
  // Trailing underscore
  variations.add(name + "_");
  // Years 1971-1985
  for (let year = 1971; year <= 1985; year++) {
    for (const sep of separators) variations.add(name + sep + year);
  }
  // Single digits 0-9
  for (let d = 0; d <= 9; d++) {
    for (const sep of separators) variations.add(name + sep + d);
  }
  // Sequential numbers: 1, 12, 123, 1234, 12345
  const seqNums = [1, 12, 123, 1234, 12345];
  for (const n of seqNums) {
    for (const sep of separators) variations.add(name + sep + n);
  }
  return Array.from(variations);
}

searchBtn.addEventListener("click", async () => {
  const namesInput = document.getElementById("names").value.trim();
  const selectedName = letterDropdown.value;
  const selectedPopular = popularDropdown.value;
  let list;
  if (selectedPopular && popularNames.includes(selectedPopular)) {
    list = generateVariations(selectedPopular);
  } else if (selectedName && Object.values(dutchNames).flat().includes(selectedName)) {
    list = generateVariations(selectedName);
  } else if (namesInput) {
    list = namesInput.split("\\n").map(s => s.trim()).filter(Boolean);
  } else {
    showToast("Selecteer een naam of plak namen hierboven");
    return;
  }
  // Remember the base name(s) you asked to search for, so they show red in the menus
  const baseNames = (selectedPopular || selectedName) ? [selectedPopular || selectedName] : list;
  for (const n of baseNames) searchedSet.add(normName(n));
  saveSearched();
  markMenuOptions();
  updateLookupBar();
  searchBtn.disabled = true;
  searchBtn.textContent = "Zoek " + list.length + " namen…";
  lastApiError = null;
  const banner = document.getElementById("searchBanner");
  banner.style.display = "none";
  let found = 0, tooOld = 0, notFound = 0, apiErrors = 0;
  for (const name of list) {
    const result = await searchUser(name);
    if (result === 1) { found++; renderGallery(); }
    else if (result === -1) tooOld++;
    else if (result === -2) apiErrors++;
    else notFound++;
    searchBtn.textContent = "Zoeken… (" + (found + tooOld + notFound + apiErrors) + "/" + list.length + ")";
  }
  renderGallery();
  searchBtn.disabled = false;
  searchBtn.textContent = "Zoek Alle";
  // Show persistent banner — stays until next search
  banner.style.display = "flex";
  if (apiErrors > 0) {
    banner.className = "search-banner err";
    banner.innerHTML = '<span class="stat">' + found + ' gevonden</span>' +
      (tooOld ? '<span class="stat">' + tooOld + ' te oud</span>' : '') +
      (notFound ? '<span class="stat">' + notFound + ' niet gevonden</span>' : '') +
      '<span class="stat" style="color:#b71c1c">⚠ ' + apiErrors + ' API fout' + (apiErrors > 1 ? "en" : "") + (lastApiError ? ': ' + lastApiError : "") + '</span>';
  } else {
    banner.className = "search-banner ok";
    banner.innerHTML = '<span class="stat">' + found + ' gevonden</span>' +
      (tooOld ? '<span class="stat">' + tooOld + ' te oud</span>' : '') +
      (notFound ? '<span class="stat">' + notFound + ' niet gevonden</span>' : '');
  }
});

letterDropdown.root.addEventListener("change", renderGallery);

document.getElementById("clearBtn").addEventListener("click", () => {
  if (confirm("Wis alle galerij geschiedenis?")) {
    history = [];
    saveCurrentGallery();
    renderGallery();
    showToast("Geschiedenis gewist");
  }
})

document.getElementById("saveGalleryBtn").addEventListener("click", () => {
  var name = galleryNameInput.value.trim();
  if (!name) { showToast("Geef een galerijnaam op"); return; }
  saveCurrentGallery();
  var key = "gallery_" + Date.now();
  galleries[key] = { name: name, count: history.length, updated: Date.now() };
  localStorage.setItem("wf_" + key, JSON.stringify(history));
  saveGalleriesMeta();
  renderGalleryList();
  showToast("Galerij opgeslagen (" + history.length + " spelers)");
});

document.getElementById("newGalleryBtn").addEventListener("click", () => {
  saveCurrentGallery();
  currentGalleryKey = "__current__";
  localStorage.setItem("wf_current_gallery", currentGalleryKey);
  history = [];
  localStorage.removeItem("wf___current__");
  renderGallery();
  showToast("Nieuwe galerij gestart");
});

// Live lookup: as you type/select a name, show whether it's already searched or uitgenodigd
document.getElementById("names").addEventListener("input", updateLookupBar);

rebuildInvitedNames();
markMenuOptions();
renderGallery();
renderGalleryList();
</script>
</body>
</html>`;

// Pre-login once at startup
let sessionCookie = null;
let loginPromise = null;

// Fetch avatar from S3 (avoids browser CORS issues)
async function fetchAvatar(userId) {
  try {
    const resp = await fetch("https://avatars-wordfeud-com.s3.amazonaws.com/256/" + userId);
    if (!resp.ok) return null;
    const buffer = Buffer.from(await resp.arrayBuffer());
    return buffer;
  } catch {
    return null;
  }
}

function login() {
  const email = "nicokooijman@gmail.com";
  const password = "Wordfeudiseenpaardje1999";
  const hashedPassword = crypto.createHash("sha1").update(password + "JarJarBinks9").digest("hex");

  return fetch("https://api.wordfeud.com/wf/user/login/email/", {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: hashedPassword })
  }).then(async (res) => {
    const body = await res.json();
    const cookie = res.headers.get("set-cookie") ?? "";
    const match = cookie.match(/sessionid=([^;]+)/);
    if (!match) throw new Error("No session cookie received");
    if (body?.status === "error") throw new Error("Login failed: " + (body.content?.type ?? "unknown"));
    return match[1];
  });
}

loginPromise = login().catch(() => null);



const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(HTML);
    return;
  }

  // Avatar proxy endpoint: GET /avatar/12345
  const avatarMatch = req.url && req.url.match(/^\/avatar\/(\d+)/);
  if (req.method === "GET" && avatarMatch) {
    const buffer = await fetchAvatar(avatarMatch[1]);
    if (buffer) {
      res.writeHead(200, { "Content-Type": "image/jpeg" });
      res.end(buffer);
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Avatar not found");
    }
    return;
  }

  if (req.method === "POST" && req.url === "/search") {
    let body = "";
    for await (const chunk of req) body += chunk;
    let query;
    try { query = JSON.parse(body); } catch { query = {}; }
    const username = query.username?.trim();
    if (!username) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, message: "Username is required" }));
      return;
    }

    try {
      // Ensure we have a session cookie
      if (!sessionCookie) {
        sessionCookie = await loginPromise;
      }
      if (!sessionCookie) throw new Error("Failed to authenticate with WordFeud API");

      async function apiFetch(url, options) {
        let retries = 0;
        while (retries < 4) {
          const res = await fetch(url, options);
          const body = await res.json();
          if (body?.status === "error" && body.content?.type && body.content.type.includes("limit_exceed")) {
            retries++;
            const delay = 3000 * retries;
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          if (body?.status === "error" && body.content?.type === "limit_exceeded") {
            retries++;
            const delay = 3000 * retries;
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          return { res, body };
        }
        throw new Error("Rate limit exceeded after retries");
      }

      const { body: searchBody } = await apiFetch("https://api.wordfeud.com/wf/user/search/", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "Cookie": "sessionid=" + sessionCookie
        },
        body: JSON.stringify({ username_or_email: username })
      });

      if (searchBody?.status === "error") {
        throw new Error(searchBody.content?.type ?? "Search failed");
      }

      const results = (searchBody?.content?.result ?? []).map(u => ({
        id: u.user_id ?? u.id,
        username: u.username
      }));

      if (results.length > 0) {
        const userId = results[0].id;
        try {
          const { body: profileBody } = await apiFetch("https://api.wordfeud.com/wf/user/" + userId + "/profile/", {
            headers: {
              "Accept": "application/json",
              "Cookie": "sessionid=" + sessionCookie
            }
          });
          if (profileBody?.content?.created) {
            results[0].created = profileBody.content.created;
          }
        } catch {
          // profile fetch failed, continue without account age
        }
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: results.length > 0,
        message: results.length === 0 ? "No users found" : undefined,
        results
      }));
    } catch (err) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, message: "WordFeud API error: " + err.message }));
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("Server running at http://0.0.0.0:" + PORT);
});

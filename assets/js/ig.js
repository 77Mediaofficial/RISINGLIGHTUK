(function(){
  /* Instagram section — curated grid (free, fully on-brand, no third-party).
     Add posts to RL_IG_POSTS below; put the images in the repo's /ig folder.
     Each entry: { img, link, caption, alt }. Empty list => section hidden.
     Add scrim:false to hide the caption band on a slide that carries its own text; the caption
     still names the link for screen readers (19 Oct 2026).
     (Optional: to pull live instead, leave RL_IG_POSTS empty and set
      RL_IG_FEED to a Behold feed URL — needs a paid plan for a 2nd feed.) */
  var RL_IG_POSTS = [
    /* 19 Oct 2026: the latest posts (Fearless series, posted 13 Oct). Images = slide 1 of each, from social/fearless-atlas. */
    { img:"ig/09.jpg", link:"https://www.instagram.com/risinglightuk/p/Debry5oDAon/", caption:"County lines isn’t a job or a favour. It’s exploitation.", alt:"County lines slide: a phone whose screen shows 6,500+ lines in England, Scotland and Wales, labelled as the police figure for 2024–25", scrim:false },
    { img:"ig/10.jpg", link:"https://www.instagram.com/risinglightuk/p/DebrlNpDAFy/", caption:"If someone asks to use your bank account to move money, it’s not a favour. It’s exploitation.", alt:"Money muling slide: a bank card between money from illegal sources and another account, above the words ‘It’s exploitation’", scrim:false },
    { img:"ig/11.jpg", link:"https://www.instagram.com/risinglightuk/p/DebrSq3DP5f/", caption:"Your phone can be replaced. You can’t.", alt:"Robbery slide headed ‘You come first’: a jacket on a hallway coat rail by the front door, one pocket unzipped, labelled ‘Phone can be blocked’", scrim:false },
    { img:"ig/01.jpg", link:"https://www.instagram.com/reel/DZhgmKiu0Rz/", caption:"Step out of the quiet — Men’s Mental Health Month", alt:"Men’s Mental Health Month film by Rising Light UK" },
    { img:"ig/02.jpg", link:"https://www.instagram.com/p/DZHotu0jG3r/", caption:"Rising Light UK × Charlie’s Promise — Mount Snowdon, July 2026", alt:"Operations showcase with Charlie’s Promise on Mount Snowdon" },
    { img:"ig/03.jpg", link:"https://www.instagram.com/p/DZIXaXEDONp/", caption:"International Department — direct aid, anywhere we can reach", alt:"Rising Light UK International Department announcement" },
    { img:"ig/04.jpg", link:"https://www.instagram.com/p/DZSTiUUjGkn/", caption:"Clothing drive — donating clothes across Surrey & London", alt:"Clothing collection drive for Surrey and London" },
    { img:"ig/05.jpg", link:"https://www.instagram.com/p/DZHxuG3DA8T/", caption:"June is Men’s Mental Health Month — check on your mates", alt:"Men’s Mental Health Month awareness post" },
    { img:"ig/06.jpg", link:"https://www.instagram.com/p/DY4NdamDOPj/", caption:"Bottled water for commuters — Waterloo, summer 2026", alt:"Water handout for commuters at Waterloo station" },
    { img:"ig/07.jpg", link:"https://www.instagram.com/reel/DYeo2oisLda/", caption:"Worldwide — impact without borders", alt:"Rising Light UK worldwide impact film" },
    { img:"ig/08.jpg", link:"https://www.instagram.com/reel/DYNWAibsJgE/", caption:"Compassion has no limits", alt:"Rising Light UK — compassion has no limits film" }
  ];
  var RL_IG_FEED = '';                 /* optional Behold feed URL (paid plan) */
  var HANDLE = 'risinglightuk';
  var COUNT = 3;

  var section = document.getElementById('rl-instagram');
  var grid = document.getElementById('rl-ig-grid');
  if(!section || !grid) return;
  var IG = 'https://www.instagram.com/' + HANDLE + '/';
  var BADGE = '<svg class="rl-ig-badge" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none"/></svg>';

  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function card(img,link,cap,alt,fr,noScrim){
    cap=cap||''; var short=cap.slice(0,110); alt=alt||short||'Rising Light UK on Instagram';
    return '<span role="listitem" class="rl-ig-li"><a class="rl-ig-card" href="'+esc(link||IG)+'" target="_blank" rel="noopener noreferrer" aria-label="'+(cap?'Instagram post: '+esc(short):'View Instagram post')+' (opens Instagram in a new tab)">'
      +'<img loading="lazy" decoding="async" src="'+esc(img)+'" alt="'+esc(alt)+'">'+BADGE
      +(fr?'<span class="rl-ig-fr" aria-hidden="true">'+esc(fr)+'</span>':'')
      +(cap&&!noScrim?'<span class="rl-ig-ov"><span class="rl-ig-cap">'+esc(cap)+'</span></span>':'')
      +'</a></span>';
  }
  function show(html){ if(!html){section.hidden=true;return;} grid.innerHTML=html; section.hidden=false; }

  function showCurated(){
    if(RL_IG_POSTS&&RL_IG_POSTS.length){
      var html=''; RL_IG_POSTS.slice(0,COUNT).forEach(function(p,i){ if(p&&p.img) html+=card(p.img,p.link,p.caption,p.alt,'FR.'+('0'+(i+1)).slice(-2),p.scrim===false); });
      show(html);
    } else { section.hidden=true; }
  }
  /* 1) Behold LIVE feed — preferred whenever a feed URL is configured, so the
        strip tracks @risinglightuk automatically. Any failure (offline, feed
        deleted, CORS) falls back to the curated stills — never a blank strip. */
  if(RL_IG_FEED){
    var skel=''; for(var i=0;i<COUNT;i++)skel+='<div class="rl-ig-skel" aria-hidden="true"></div>';
    grid.innerHTML=skel; section.hidden=false;
    var pickImg=function(p){var s=p.sizes;if(s){var z=s.medium||s.small||s.large||s.full;if(z&&z.mediaUrl)return z.mediaUrl;}return p.thumbnailUrl||p.mediaUrl||'';};
    var capOf=function(p){if(p.prunedCaption)return p.prunedCaption;if(typeof p.caption==='string')return p.caption;if(p.caption&&p.caption.text)return p.caption.text;return '';};
    fetch(RL_IG_FEED,{mode:'cors'}).then(function(r){if(!r.ok)throw 0;return r.json();})
      .then(function(d){var posts=Array.isArray(d)?d:(d.posts||d.data||[]),h='';posts.slice(0,COUNT).forEach(function(p,i){var u=pickImg(p);if(u)h+=card(u,p.permalink,capOf(p),p.altText,'FR.'+('0'+(i+1)).slice(-2));});if(h)show(h);else showCurated();})
      .catch(showCurated);
    return;
  }
  /* 2) Curated posts from the repo (no feed configured) */
  showCurated();
})();

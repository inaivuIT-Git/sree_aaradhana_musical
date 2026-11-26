'use strict';
const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('#site-nav');
function closeMenu(){nav?.classList.remove('is-open');toggle?.setAttribute('aria-expanded','false');toggle?.setAttribute('aria-label','Open navigation');}
toggle?.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Close navigation':'Open navigation');nav.classList.toggle('is-open',open);});
nav?.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));
document.addEventListener('keydown',e=>{if(e.key==='Escape' && toggle?.getAttribute('aria-expanded')==='true'){closeMenu();toggle.focus();}});
const viewer=document.querySelector('#photo-viewer');
let previousOverflow='';
document.querySelectorAll('[data-full-image]').forEach(button=>button.addEventListener('click',()=>{if(!viewer)return;viewer.querySelector('img').src=button.dataset.fullImage;viewer.querySelector('img').alt=button.dataset.caption;viewer.querySelector('p').textContent=button.dataset.caption;previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';viewer.showModal();}));
viewer?.querySelector('.viewer-close').addEventListener('click',()=>viewer.close());
viewer?.addEventListener('close',()=>{document.body.style.overflow=previousOverflow;});
viewer?.addEventListener('click',e=>{if(e.target===viewer){const r=viewer.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)viewer.close();}});
const form=document.querySelector('#contactForm');
form?.addEventListener('submit',e=>{e.preventDefault();if(!form.reportValidity())return;const fields=new FormData(form);const text=`Hello Sree Aaradhana, I would like to enquire about your classes.\n\nName: ${fields.get('name')}\nCourse: ${fields.get('subject')}\nMessage: ${fields.get('message')}`;const link=document.createElement('a');link.href='https://wa.me/919514488517?text='+encodeURIComponent(text);link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open your enquiry in WhatsApp ↗';const status=document.querySelector('#form-status');status.replaceChildren(document.createTextNode('Your enquiry is ready. Review it and tap Send in WhatsApp. '),link);link.click();});

const examCarousel=document.querySelector('#examCarousel');
if(examCarousel&&window.bootstrap&&matchMedia('(prefers-reduced-motion: reduce)').matches){bootstrap.Carousel.getOrCreateInstance(examCarousel).pause();}
// Launch advertisement: shown once per browser session, on whichever page the visitor opens first.
(function(){
  let seen=false;
  try{seen=sessionStorage.getItem('adSeen')==='1';}catch(e){}
  if(seen||typeof HTMLDialogElement!=='function')return;
  const ad=document.createElement('dialog');
  ad.className='launch-ad';
  ad.setAttribute('aria-label','Sound healing therapy and music classes for children');
  ad.innerHTML='<button class="viewer-close" aria-label="Close advertisement">×</button>'+
    '<img src="assets/images/sound-healing-therapy-ad.webp" width="1169" height="1280" alt="Sree Aaradhana School of Music: sound healing therapy and music training for children with autism and hyperactivity. Admissions open to train children as drummers, keyboard players, guitarists, violinists and singers. For details call +91 84897 77293.">'+
    '<div class="launch-ad-actions"><a class="button small" href="tel:+918489777293">Call +91 84897 77293</a><button class="text-link launch-ad-dismiss">Continue to site</button></div>';
  document.body.appendChild(ad);
  const close=()=>ad.close();
  ad.querySelector('.viewer-close').addEventListener('click',close);
  ad.querySelector('.launch-ad-dismiss').addEventListener('click',close);
  ad.addEventListener('click',e=>{if(e.target===ad)close();});
  ad.addEventListener('close',()=>{document.body.style.overflow='';});
  setTimeout(()=>{if(document.querySelector('dialog[open]'))return;try{sessionStorage.setItem('adSeen','1');}catch(e){}document.body.style.overflow='hidden';ad.showModal();},600);
})();

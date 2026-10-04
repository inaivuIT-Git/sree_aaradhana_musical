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

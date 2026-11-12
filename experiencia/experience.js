import './world.js';

const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const mobile=matchMedia('(max-width: 700px)');
const mount=document.querySelector('#world');
const progressBar=document.querySelector('#progress-bar');
const progressLabel=document.querySelector('#progress-label');
document.querySelector('#year').textContent=new Date().getFullYear();
const dialog=document.querySelector('dialog');
const courseData={a1:{title:'A1 · Beginner',lines:['Inicio: 9 de marzo de 2027 · Finalización: 9 de diciembre de 2027.','Martes y jueves, de 18:30 a 19:30.','Dos clases semanales de 60 minutos. Material incluido.','El valor total del curso se fracciona en 10 cuotas mensuales.']},b2:{title:'B2 · First',lines:['Dos clases semanales de 90 minutos. Material incluido.','Lunes y miércoles, 19:40 a 21:10 · Stefany Amada. Del 8 de marzo al 8 de diciembre de 2027.','Martes y jueves, 08:00 a 09:30 o 17:00 a 18:30 · Carla Migliarini. Del 9 de marzo al 9 de diciembre de 2027.','Requisito: nivel B1 aprobado o certificación equivalente. El valor total se fracciona en 10 cuotas mensuales.']}};
document.querySelectorAll('[data-course]').forEach(button=>button.addEventListener('click',()=>{const key=button.dataset.course;const data=courseData[key];document.querySelector('#dialog-title').textContent=data.title;const ul=document.createElement('ul');for(const line of data.lines){const li=document.createElement('li');li.textContent=line;ul.append(li);}document.querySelector('#dialog-body').replaceChildren(ul);document.querySelector('#course-link').href=`cursos.html?curso=${key}`;dialog.showModal();}));
dialog.querySelector('.close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});


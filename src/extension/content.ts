// src/extension/content.ts
console.log("School Portal Pro+ content script loaded.");

// This is where we will inject the floating widget
const widget = document.createElement('div');
widget.id = 'school-portal-pro-widget';
widget.style.position = 'fixed';
widget.style.bottom = '20px';
widget.style.right = '20px';
widget.style.zIndex = '9999';
widget.innerHTML = '<div style="background: #10b981; color: white; padding: 10px; border-radius: 50%; cursor: pointer;">AI</div>';
document.body.appendChild(widget);

widget.addEventListener('click', () => {
  console.log("Widget clicked!");
  // Here we will eventually open a popup or render our React app
});

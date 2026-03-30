console.log("GradeAI Content Script Loaded");

function isSchoolPortal() {
  const hostname = window.location.hostname.toLowerCase();
  
  // 1. Exact or partial matches for known major LMS platforms
  const knownPlatforms = [
    'classroom.google.com', 'instructure.com', 'edunext.co', 'moodle', 
    'blackboard.com', 'schoology.com', 'powerschool.com', 'canvas', 
    'managebac.com', 'd2l.com', 'brightspace.com', 'sakailms', 'itslearning.com'
  ];
  if (knownPlatforms.some(p => hostname.includes(p))) return true;

  // 2. Common educational top-level domains or subdomains
  if (hostname.endsWith('.edu') || hostname.endsWith('.ac.uk') || hostname.endsWith('.edu.au')) return true;
  
  // 3. Common keywords in the URL that strongly suggest a school portal
  const schoolKeywords = ['school', 'academy', 'lms', 'learn', 'student', 'portal', 'university', 'college', 'classboard', 'education'];
  if (schoolKeywords.some(kw => hostname.includes(kw))) return true;

  // 4. Meta tags or title heuristics (fallback)
  const title = document.title.toLowerCase();
  if (title.includes('lms') || (title.includes('student') && title.includes('portal')) || title.includes('course dashboard')) return true;

  return false;
}

function injectGradeAIButton() {
  // "Game Mode" activation: Only show up if we are on a school portal
  if (!isSchoolPortal()) {
    console.log("GradeAI: Not a recognized school portal or LMS. Staying hidden.");
    return;
  }

  if (document.getElementById('gradeai-extension-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'gradeai-extension-btn';
  
  // Detect platform dynamically
  const hostname = window.location.hostname;
  let platform = 'School Portal';
  
  if (hostname.includes('classroom.google.com')) platform = 'Classroom';
  else if (hostname.includes('instructure.com')) platform = 'Canvas';
  else if (hostname.includes('edunext.co')) platform = 'Edunext';
  else if (hostname.includes('moodle')) platform = 'Moodle';
  else if (hostname.includes('blackboard.com')) platform = 'Blackboard';
  else if (hostname.includes('schoology.com')) platform = 'Schoology';
  else {
    // Try to extract a readable name from the domain (e.g., "myschoolboard.com" -> "Myschoolboard")
    const parts = hostname.split('.');
    if (parts.length > 1) {
      const mainPart = parts[parts.length - 2];
      if (mainPart && mainPart.length > 3) {
        platform = mainPart.charAt(0).toUpperCase() + mainPart.slice(1);
      }
    }
  }

  btn.innerHTML = `🤖 Grade with ${platform}`;
  btn.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 999999;
    background-color: #10b981;
    color: white;
    border: none;
    border-radius: 8px;
    padding: 12px 20px;
    font-weight: bold;
    font-size: 14px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
    font-family: 'Google Sans', Roboto, Arial, sans-serif;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.2s ease;
  `;

  btn.onmouseover = () => {
    btn.style.transform = 'translateY(-2px)';
    btn.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.4)';
  };
  btn.onmouseout = () => {
    btn.style.transform = 'translateY(0)';
    btn.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
  };

  btn.onclick = () => {
    // In a real extension, this would open the extension popup or a side panel.
    // For now, it opens the hosted web app.
    window.open('https://ais-dev-vftqiil45hcudmfjwz5n3o-673800453378.asia-southeast1.run.app', 'GradeAI', 'width=1000,height=800');
  };

  document.body.appendChild(btn);
}

// Run injection after page load
setTimeout(injectGradeAIButton, 3000);

// src/content.ts
console.log("GradeAI.pro: Eric is entering the barn...");

// Generic scanner to find homework links
function scanForHomework() {
  const links = Array.from(document.querySelectorAll('a'));
  const homeworkLinks = links.filter(link => {
    const text = link.textContent?.toLowerCase() || "";
    return text.includes('homework') || text.includes('assignment') || text.includes('download');
  });

  console.log(`GradeAI.pro: Found ${homeworkLinks.length} potential homework links.`);
  
  homeworkLinks.forEach((link, index) => {
    console.log(`Link ${index + 1}: ${link.href}`);
    // Here we would add logic to "collect the sheep" (download files)
  });
}

// Run the scanner
scanForHomework();

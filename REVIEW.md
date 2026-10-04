# Sree Aaradhana website refresh

Static HTML, CSS and JavaScript for the existing Hostinger site. No build step.

## Changed pages
- index.html: responsive home page, supplied logo, new Attur branch announcement, course details, enquiry flow and existing Salem location maps.
- gallery.html: nine supplied celebration photos with accessible full-size dialogs, the requested YouTube video, and the repository's existing Drums.mp4.
- event.html: consistent navigation and clear archive labelling for the October 2025 announcement.
- assets/css/modern.css and assets/js/modern.js: shared layout, mobile navigation, photo dialogs and WhatsApp enquiry preparation.
- assets/images/academy-logo.jpeg, attur-branch-banner.jpeg and gallery/: supplied images copied without visual alteration.

## Contact behaviour
The old page displayed success before any delivery confirmation and referenced send_enquiry.php, which is absent from this repository. The new form prepares an enquiry for WhatsApp at the school's existing published number, +91 95144 88517. The visitor must review it and press Send in WhatsApp. There is also a direct call link. Confirm that this school number accepts WhatsApp before release; otherwise use the call option or connect a verified enquiry endpoint.

The Attur banner numbers are 95242 24421 and 95242 24420. They are separate call links.

## Validation
Passed JavaScript syntax, duplicate ID, local navigation/anchor, modal and tab target, image path and image-alt checks. All nine uploaded gallery photos are included, and the YouTube embed points to kQQ5izL5ItQ.

Browser visual and interaction verification remains pending: the local browser download failed and the cloud browser could not access the local preview. Before deployment, inspect desktop and mobile layouts; open and close every course modal and a photo dialog; test mobile navigation, branch-banner enlargement, location tabs, both video players and enquiry preparation. Do not send a test enquiry to the school without authorization.

## Preview and deploy
1. Serve this repository locally using `python3 -m http.server 8080` and open http://localhost:8080.
2. Review the draft pull request and complete the browser checks above.
3. Back up the existing Hostinger web root.
4. Copy the changed HTML files and added assets into that web root, preserving the existing assets and any server-side files. No dependency install is needed.
5. Verify https://www.sreeaaradhana.in/ and both secondary pages after deployment.

Existing large course images are retained and lazy-loaded. Bootstrap 5.3.3 is still loaded from jsDelivr for course modals and map tabs. YouTube and Google Maps require network access. No production deployment is performed by this branch.

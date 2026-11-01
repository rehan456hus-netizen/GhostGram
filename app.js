
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const configured =
  !firebaseConfig.apiKey.startsWith("PASTE_") &&
  !firebaseConfig.projectId.startsWith("PASTE_");

let auth, db;

const $ = id => document.getElementById(id);

function setStatus(t, error = false) {
  $("authStatus").textContent = t;
  $("authStatus").className = "status " + (error ? "error" : "");
}

function authAlias(username) {
  return `${username.toLowerCase()}@ghostgram.invalid`;
}

let mode = "login";

let posts = JSON.parse(localStorage.getItem("gg_posts") || "null") || [
  { user: "Ayaan Ghost", caption: "Living in my own world 👻", img: "", likes: 1250 },
  { user: "Zoya", caption: "Green lights, calm nights 💚", img: "", likes: 842 }
];

let photoData = "";

if (configured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  onAuthStateChanged(auth, user => {
    if (user) enterApp(user);
    else showAuth();
  });
} else {
  setStatus("Firebase setup needed: add your Web App config in firebase-config.js.");
}

// LOGIN / SIGNUP MODE

window.setAuthMode = (m) => {
  mode = m;

  $("loginTab").classList.toggle("selected", m === "login");
  $("signupTab").classList.toggle("selected", m === "signup");

  $("emailWrap").hidden = m !== "signup";
  $("identityWrap").hidden = m === "signup";
  $("usernameWrap").hidden = m !== "signup";
  $("confirmWrap").hidden = m !== "signup";

  $("identity").required = m === "login";
  $("newUsername").required = m === "signup";
  $("confirmPassword").required = m === "signup";
  $("password").required = true;

  $("usernameLabel").textContent = "Username";
  $("identity").placeholder = "Enter your username";
  $("identity").type = "text";

  $("submitAuth").textContent =
    m === "login" ? "Log in" : "Create account";

  $("password").autocomplete =
    m === "login" ? "current-password" : "new-password";

  $("resetButton").hidden = m === "signup";

  setStatus("");
};

// LOGIN / SIGNUP SUBMIT

$("authForm").addEventListener("submit", async e => {
  e.preventDefault();

  if (!configured) {
    setStatus("First finish Firebase setup using SETUP.txt.", true);
    return;
  }

  const identity = $("identity").value.trim().toLowerCase();
  const pass = $("password").value;

  try {
    $("submitAuth").disabled = true;

    if (mode === "signup") {
      const uname = $("newUsername").value.trim().toLowerCase();
      const email = $("email").value.trim().toLowerCase();
      const confirm = $("confirmPassword").value;

      if (!/^[a-z0-9_]{3,20}$/.test(uname))
        throw Error("Username must be 3–20 characters: letters, numbers or underscore.");

      if (pass.length < 6)
        throw Error("Password must be at least 6 characters.");

      if (pass !== confirm)
        throw Error("Passwords do not match.");

      const ref = doc(db, "usernames", uname);

      if ((await getDoc(ref)).exists())
        throw Error("That username is already taken.");

      const cred = await createUserWithEmailAndPassword(
        auth,
        authAlias(uname),
        pass
      );

      await updateProfile(cred.user, { displayName: uname });

      await setDoc(doc(db, "users", cred.user.uid), {
        username: uname,
        recoveryEmail: email || null,
        createdAt: serverTimestamp()
      });

      await setDoc(ref, {
        uid: cred.user.uid,
        loginEmail: authAlias(uname)
      });

      enterApp(cred.user);

    } else {
      if (!/^[a-z0-9_]{3,20}$/.test(identity))
        throw Error("Enter your GhostGram username.");

      const snap = await getDoc(doc(db, "usernames", identity));

      if (!snap.exists())
        throw Error("Username not found. Check your spelling.");

      const loginEmail = snap.data().loginEmail;

      if (!loginEmail)
        throw Error("This is an older account. Please use its original email address.");

      const cred = await signInWithEmailAndPassword(
        auth,
        loginEmail,
        pass
      );

      enterApp(cred.user);
    }

  } catch (err) {
    setStatus(friendly(err), true);

  } finally {
    $("submitAuth").disabled = false;
  }
});

// FORGOT PASSWORD

window.resetPassword = async () => {
  setStatus(
    "Email-free accounts cannot use email password reset. Keep your password safe.",
    true
  );
};

// GOOGLE SIGN IN

window.googleSignIn = async () => {
  if (!configured) {
    setStatus("Finish Firebase setup first.", true);
    return;
  }

  try {
    const p = new GoogleAuthProvider();
    const r = await signInWithPopup(auth, p);

    const ref = doc(db, "users", r.user.uid);

    if (!(await getDoc(ref)).exists()) {
      const uname =
        (r.user.displayName || "ghost")
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, "")
          .slice(0, 14) +
        "_" +
        r.user.uid.slice(0, 4);

      await setDoc(ref, {
        username: uname,
        recoveryEmail: r.user.email,
        createdAt: serverTimestamp()
      });

      await setDoc(doc(db, "usernames", uname), {
        uid: r.user.uid,
        loginEmail: r.user.email
      });
    }

    enterApp(r.user);

  } catch (e) {
    setStatus(friendly(e), true);
  }
};

// ERROR MESSAGES

function friendly(e) {
  const c = e.code || "";

  if (c.includes("email-already-in-use"))
    return "That username is already registered. Please log in.";

  if (c.includes("weak-password"))
    return "Use a password with at least 6 characters.";

  if (c.includes("invalid-credential"))
    return "Incorrect username or password.";

  if (c.includes("popup"))
    return "Google sign-in popup was blocked. Allow popups and try again.";

  if (c.includes("permission-denied"))
    return "Firestore rules need updating. Follow the new rules in SETUP.txt.";

  return e.message || "Something went wrong.";
}

// AUTH SCREEN

function showAuth() {
  $("auth").hidden = false;
  $("app").hidden = true;
}

// ENTER APP

function enterApp(user) {
  $("auth").hidden = true;
  $("app").hidden = false;

  $("profileName").textContent = user.displayName || "GhostGram user";

  $("profileEmail").textContent =
    user.email?.endsWith("@ghostgram.invalid")
      ? "@" + (user.displayName || "ghost")
      : user.email || "";

  $("displayName").value = user.displayName || "";

  renderStories();
  renderFeed();
  show("home");
}

// LOGOUT

window.logout = async () => {
  if (auth) await signOut(auth);
  showAuth();
};

// NAVIGATION

window.show = id => {
  document.querySelectorAll(".page").forEach(p =>
    p.classList.toggle("active", p.id === id)
  );

  document.querySelectorAll(".tabs button").forEach(b =>
    b.classList.toggle("active", b.dataset.page === id)
  );

  if (id === "profile") renderProfile();
  if (id === "home") renderFeed();

  window.scrollTo(0, 0);
};

// TOAST

window.toast = t => {
  const e = $("toast");
  e.textContent = t;
  e.style.display = "block";

  setTimeout(() => e.style.display = "none", 2200);
};

// STORIES

function renderStories() {
  $("stories").innerHTML = [
    "Your story", "Ayaan", "Sameer", "Zoya", "Arman"
  ].map((n, i) =>
    `<div class="story">
      <div class="ring">
        <div class="avatar">${i ? n[0] : "＋"}</div>
      </div>
      ${n}
    </div>`
  ).join("");
}

// FEED

function renderFeed() {
  $("feed").innerHTML = posts.map((p, i) =>
    `<article class="post">
      <div class="post-head">
        <div class="avatar">${escapeHtml(p.user[0])}</div>
        <div>
          <b>${escapeHtml(p.user)}</b>
          <small>GhostGram · demo feed</small>
        </div>
      </div>

      ${p.img
        ? `<img class="post-img" src="${p.img}">`
        : `<div class="placeholder-img">👻</div>`
      }

      <div class="post-actions">
        <button onclick="likePost(${i})">♡</button>
        <button onclick="toast('Comments backend is next')">♧</button>
        <button onclick="toast('Share feature coming soon')">➤</button>
      </div>

      <div class="post-copy">
        <b>${p.likes || 0} likes</b><br>
        <b>${escapeHtml(p.user)}</b>
        ${escapeHtml(p.caption)}
      </div>
    </article>`
  ).join("");
}

// LIKES

window.likePost = i => {
  posts[i].likes = (posts[i].likes || 0) + 1;
  renderFeed();
};

// PHOTO PREVIEW

window.previewPhoto = e => {
  const f = e.target.files[0];

  if (!f) return;

  if (f.size > 2 * 1024 * 1024) {
    toast("Choose an image under 2 MB");
    return;
  }

  const r = new FileReader();

  r.onload = () => {
    photoData = r.result;
    $("preview").src = photoData;
    $("preview").hidden = false;
  };

  r.readAsDataURL(f);
};

// CREATE POST

window.createPost = () => {
  const c = $("caption").value.trim();

  if (!c && !photoData)
    return toast("Add a caption or photo");

  posts.unshift({
    user: auth?.currentUser?.displayName || "You",
    caption: c,
    img: photoData,
    likes: 0
  });

  localStorage.setItem("gg_posts", JSON.stringify(posts));

  $("caption").value = "";
  photoData = "";
  $("preview").hidden = true;

  show("home");
  toast("Demo post added on this device");
};

// SEARCH POSTS

window.searchPosts = q => {
  const found = posts.filter(p =>
    (p.caption + " " + p.user).toLowerCase().includes(q.toLowerCase())
  );

  $("searchResults").innerHTML =
    found.map(p =>
      `<div class="message">
        <b>${escapeHtml(p.user)}</b>
        <p>${escapeHtml(p.caption)}</p>
      </div>`
    ).join("") || "No matching posts.";
};

// SAVE PROFILE

window.saveProfile = async () => {
  const n = $("displayName").value.trim();

  if (!n) return toast("Enter a display name");

  try {
    await updateProfile(auth.currentUser, { displayName: n });

    $("profileName").textContent = n;
    toast("Profile updated");

  } catch (e) {
    toast(friendly(e));
  }
};

// PROFILE

function renderProfile() {
  $("postCount").textContent = posts.filter(
    p => p.user === auth?.currentUser?.displayName
  ).length;

  $("myPosts").innerHTML = posts.filter(
    p => p.user === auth?.currentUser?.displayName
  ).map(p =>
    `<div class="message">${escapeHtml(p.caption)}</div>`
  ).join("") || '<p class="muted">Your posts will appear here.</p>';
}

// HTML SAFETY

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

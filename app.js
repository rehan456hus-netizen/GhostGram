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

const configured = Boolean(
  firebaseConfig?.apiKey &&
  firebaseConfig?.projectId &&
  firebaseConfig?.authDomain &&
  !String(firebaseConfig.apiKey).startsWith("PASTE_") &&
  !String(firebaseConfig.projectId).startsWith("PASTE_")
);

const $ = id => document.getElementById(id);
let auth = null;
let db = null;
let mode = "login";
let currentUserData = {};

let posts;
try {
  posts = JSON.parse(localStorage.getItem("gg_posts") || "null") || [
    { user: "Ayaan Ghost", caption: "Living in my own world 👻", img: "", likes: 1250 },
    { user: "Zoya", caption: "Green lights, calm nights 💚", img: "", likes: 842 }
  ];
} catch {
  posts = [];
}
let photoData = "";

function setStatus(message, error = false) {
  const el = $("authStatus");
  if (!el) return;
  el.textContent = message;
  el.className = "status" + (error ? " error" : "");
}

function authAlias(username) {
  return `${username.toLowerCase()}@ghostgram.invalid`;
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function friendly(e) {
  const c = e?.code || "";
  if (c.includes("email-already-in-use")) return "That username is already registered. Please log in.";
  if (c.includes("weak-password")) return "Use a password with at least 6 characters.";
  if (c.includes("invalid-credential") || c.includes("wrong-password")) return "Incorrect username or password.";
  if (c.includes("popup")) return "Google sign-in popup was blocked. Allow popups and try again.";
  if (c.includes("permission-denied")) return "Firestore permission denied. Check your Firestore Rules.";
  if (c.includes("too-many-requests")) return "Too many attempts. Please try again later.";
  if (c.includes("app-not-authorized")) return "This website domain is not authorized in Firebase Authentication.";
  return e?.message || "Something went wrong. Please try again.";
}

// Firebase initialization
if (configured) {
  try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    onAuthStateChanged(auth, user => {
      if (user) enterApp(user);
      else showAuth();
    });
  } catch (e) {
    console.error(e);
    setStatus("Firebase could not start. Check firebase-config.js.", true);
  }
} else {
  setStatus("Firebase setup needed. Check firebase-config.js.", true);
}

// Login / signup mode
window.setAuthMode = m => {
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
  $("submitAuth").textContent = m === "login" ? "Log in" : "Create account";
  $("password").autocomplete = m === "login" ? "current-password" : "new-password";
  $("resetButton").hidden = m === "signup";
  setStatus("");
};

$("authForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!configured || !auth || !db) {
    setStatus("Firebase setup is incomplete. Check firebase-config.js.", true);
    return;
  }

  const identity = $("identity").value.trim().toLowerCase();
  const pass = $("password").value;
  const button = $("submitAuth");

  try {
    button.disabled = true;

    if (mode === "signup") {
      const uname = $("newUsername").value.trim().toLowerCase();
      const email = $("email").value.trim().toLowerCase();
      const confirm = $("confirmPassword").value;

      if (!/^[a-z0-9_]{3,20}$/.test(uname)) {
        throw new Error("Username must be 3–20 characters: letters, numbers or underscore.");
      }
      if (pass.length < 6) throw new Error("Password must be at least 6 characters.");
      if (pass !== confirm) throw new Error("Passwords do not match.");
      if (email && !validEmail(email)) throw new Error("Enter a valid recovery email.");

      const usernameRef = doc(db, "usernames", uname);
      if ((await getDoc(usernameRef)).exists()) throw new Error("That username is already taken.");

      const cred = await createUserWithEmailAndPassword(auth, authAlias(uname), pass);
      await updateProfile(cred.user, { displayName: uname });

      await setDoc(doc(db, "users", cred.user.uid), {
        username: uname,
        recoveryEmail: email || null,
        recoveryEmailStatus: email ? "not_verified" : "not_added",
        createdAt: serverTimestamp()
      });

      await setDoc(usernameRef, {
        uid: cred.user.uid,
        loginEmail: authAlias(uname)
      });

      setStatus("Account created. You can add or verify recovery options in Account Security.");
      await enterApp(cred.user);

    } else {
      if (!/^[a-z0-9_]{3,20}$/.test(identity)) {
        throw new Error("Enter your GhostGram username.");
      }

      const snap = await getDoc(doc(db, "usernames", identity));
      if (!snap.exists()) throw new Error("Username not found. Check your spelling.");

      const loginEmail = snap.data().loginEmail;
      if (!loginEmail) throw new Error("This account's login record is incomplete. Contact support.");

      const cred = await signInWithEmailAndPassword(auth, loginEmail, pass);
      await enterApp(cred.user);
    }

  } catch (err) {
    setStatus(friendly(err), true);
  } finally {
    button.disabled = false;
  }
});

// Password recovery information
window.resetPassword = () => {
  const username = window.prompt("Enter your GhostGram username:");
  if (username === null) return;

  const clean = username.trim().toLowerCase();

  if (!/^[a-z0-9_]{3,20}$/.test(clean)) {
    setStatus("Enter a valid GhostGram username (3–20 letters, numbers or underscores).", true);
    return;
  }

  setStatus(
    "We cannot automatically reset this username-based account yet. Your saved recovery email is only a contact record, not a Firebase Auth reset address. Keep your current password safe; automatic recovery needs a secure backend.",
    true
  );
};

// Google sign in
window.googleSignIn = async () => {
  if (!configured || !auth || !db) {
    return setStatus("Firebase setup is incomplete.", true);
  }

  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const userRef = doc(db, "users", result.user.uid);
    const existing = await getDoc(userRef);

    if (!existing.exists()) {
      const base = (result.user.displayName || "ghost")
        .toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 14) || "ghost";

      const uname = `${base}_${result.user.uid.slice(0, 4)}`;
      const usernameRef = doc(db, "usernames", uname);

      await setDoc(userRef, {
        username: uname,
        recoveryEmail: result.user.email || null,
        recoveryEmailStatus: result.user.email ? "google_account_email" : "not_added",
        createdAt: serverTimestamp()
      });

      await setDoc(usernameRef, {
        uid: result.user.uid,
        loginEmail: result.user.email
      });
    }

    await enterApp(result.user);

  } catch (e) {
    setStatus(friendly(e), true);
  }
};

// Auth screen
function showAuth() {
  $("auth").hidden = false;
  $("app").hidden = true;
}

// Enter app and load private security data
async function enterApp(user) {
  $("auth").hidden = true;
  $("app").hidden = false;

  $("profileName").textContent = user.displayName || "GhostGram user";
  $("profileEmail").textContent = user.email?.endsWith("@ghostgram.invalid")
    ? "@" + (user.displayName || "ghost")
    : (user.email || "");

  $("displayName").value = user.displayName || "";

  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    currentUserData = snap.exists() ? snap.data() : {};

    $("recoveryEmail").value = currentUserData.recoveryEmail || "";
    $("recoveryPhone").value = user.phoneNumber || currentUserData.recoveryPhone || "";

    updateEmailSecurityStatus();
    updatePhoneSecurityStatus(user);

  } catch (e) {
    console.error("Profile/security load error:", e);
    $("emailSecurityStatus").textContent = "Could not load security details. Check your connection and Firestore Rules.";
  }

  renderStories();
  renderFeed();
  show("home");
}

function updateEmailSecurityStatus() {
  const email = currentUserData.recoveryEmail;
  const status = currentUserData.recoveryEmailStatus;

  if (!email) {
    $("emailSecurityStatus").textContent = "No recovery email saved.";
  } else if (status === "verified") {
    $("emailSecurityStatus").textContent = `Saved email: ${email} · Verified`;
  } else {
    $("emailSecurityStatus").textContent = `Saved email: ${email} · Not verified. It cannot receive GhostGram password-reset links yet.`;
  }
}

// Phone verification disabled because Firebase SMS billing is not enabled.
function updatePhoneSecurityStatus(user) {
  if (user?.phoneNumber) {
    $("phoneSecurityStatus").textContent =
      `Verified phone linked: ${user.phoneNumber}`;
    $("recoveryPhone").value = user.phoneNumber;
  } else {
    $("phoneSecurityStatus").textContent =
      "Phone verification is currently unavailable. Please try again later.";
  }

  $("recoveryPhone").disabled = true;
  $("sendOTPButton").disabled = true;
  $("phoneOTP").hidden = true;
  $("verifyPhoneButton").hidden = true;
}

// Logout
window.logout = async () => {
  try {
    if (auth) await signOut(auth);
    showAuth();
  } catch (e) {
    toast(friendly(e));
  }
};

// Navigation
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

// Toast
window.toast = message => {
  const el = $("toast");
  if (!el) return;

  el.textContent = message;
  el.style.display = "block";

  setTimeout(() => {
    el.style.display = "none";
  }, 2200);
};

// Stories
function renderStories() {
  $("stories").innerHTML = ["Your story", "Ayaan", "Sameer", "Zoya", "Arman"]
    .map((name, i) =>
      `<div class="story"><div class="ring"><div class="avatar">${i ? escapeHtml(name[0]) : "＋"}</div></div>${escapeHtml(name)}</div>`
    )
    .join("");
}

// Feed
function renderFeed() {
  $("feed").innerHTML = posts.map((p, i) => `
    <article class="post">
      <div class="post-head">
        <div class="avatar">${escapeHtml(String(p.user || "G")[0])}</div>
        <div><b>${escapeHtml(p.user)}</b><small>GhostGram · demo feed</small></div>
      </div>
      ${p.img ? `<img class="post-img" src="${p.img}" alt="Post image">` : `<div class="placeholder-img">👻</div>`}
      <div class="post-actions">
        <button type="button" onclick="likePost(${i})">♡</button>
        <button type="button" onclick="toast('Comments backend is not connected yet')">♧</button>
        <button type="button" onclick="toast('Share feature coming soon')">➤</button>
      </div>
      <div class="post-copy"><b>${Number(p.likes) || 0} likes</b><br><b>${escapeHtml(p.user)}</b> ${escapeHtml(p.caption)}</div>
    </article>
  `).join("");
}

window.likePost = i => {
  if (!posts[i]) return;

  posts[i].likes = (Number(posts[i].likes) || 0) + 1;
  localStorage.setItem("gg_posts", JSON.stringify(posts));

  renderFeed();
};

window.previewPhoto = e => {
  const file = e.target.files?.[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    toast("Choose an image under 2 MB");
    e.target.value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    photoData = reader.result;
    $("preview").src = photoData;
    $("preview").hidden = false;
  };

  reader.readAsDataURL(file);
};

window.createPost = () => {
  const caption = $("caption").value.trim();

  if (!caption && !photoData) {
    return toast("Add a caption or photo");
  }

  posts.unshift({
    user: auth?.currentUser?.displayName || "You",
    caption,
    img: photoData,
    likes: 0
  });

  try {
    localStorage.setItem("gg_posts", JSON.stringify(posts));
  } catch {}

  $("caption").value = "";
  $("photo").value = "";
  photoData = "";
  $("preview").src = "";
  $("preview").hidden = true;

  show("home");
  toast("Demo post added on this device");
};

window.searchPosts = query => {
  const found = posts.filter(p =>
    `${p.caption || ""} ${p.user || ""}`.toLowerCase().includes(query.toLowerCase())
  );

  $("searchResults").innerHTML = found.map(p =>
    `<div class="message"><b>${escapeHtml(p.user)}</b><p>${escapeHtml(p.caption)}</p></div>`
  ).join("") || "No matching posts.";
};

// Save profile
window.saveProfile = async () => {
  const user = auth?.currentUser;
  const name = $("displayName").value.trim();

  if (!user) return toast("Please log in first.");
  if (!name) return toast("Enter a display name.");

  try {
    await updateProfile(user, { displayName: name });

    await setDoc(doc(db, "users", user.uid), {
      displayName: name
    }, { merge: true });

    $("profileName").textContent = name;

    $("profileEmail").textContent =
      user.email?.endsWith("@ghostgram.invalid")
        ? "@" + (currentUserData.username || name)
        : (user.email || "");

    toast("Profile updated");

  } catch (e) {
    toast(friendly(e));
  }
};

// Save recovery email privately; no claim of verification.
window.addRecoveryEmail = async () => {
  const user = auth?.currentUser;
  const email = $("recoveryEmail").value.trim().toLowerCase();

  if (!user) return toast("Please log in first.");
  if (!validEmail(email)) return toast("Enter a valid email address.");

  const button = $("recoveryEmailButton");

  try {
    button.disabled = true;

    await setDoc(doc(db, "users", user.uid), {
      recoveryEmail: email,
      recoveryEmailStatus: "not_verified",
      recoveryEmailUpdatedAt: serverTimestamp()
    }, { merge: true });

    currentUserData.recoveryEmail = email;
    currentUserData.recoveryEmailStatus = "not_verified";

    updateEmailSecurityStatus();
    toast("Recovery email saved privately");

  } catch (e) {
    $("emailSecurityStatus").textContent = friendly(e);
  } finally {
    button.disabled = false;
  }
};

// Phone OTP is disabled. No SMS request is made.
window.sendPhoneCode = () => {
  $("phoneSecurityStatus").textContent =
    "Phone verification is currently unavailable. Please try again later.";

  $("recoveryPhone").disabled = true;
  $("sendOTPButton").disabled = true;
  $("phoneOTP").hidden = true;
  $("verifyPhoneButton").hidden = true;
};

window.verifyPhoneCode = () => {
  $("phoneSecurityStatus").textContent =
    "Phone verification is currently unavailable. Please try again later.";

  $("phoneOTP").hidden = true;
  $("verifyPhoneButton").hidden = true;
};

// Profile
function renderProfile() {
  const username = auth?.currentUser?.displayName;

  $("postCount").textContent =
    posts.filter(p => p.user === username).length;

  $("myPosts").innerHTML = posts.filter(p => p.user === username)
    .map(p => `<div class="message">${escapeHtml(p.caption)}</div>`)
    .join("") || '<p class="muted">Your posts will appear here.</p>';
}

// HTML safety for text inserted into markup.
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

// Start in login mode and make all visibility/required states consistent.
window.setAuthMode("login");

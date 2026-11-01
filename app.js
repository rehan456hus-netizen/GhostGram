
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  updateProfile,
  RecaptchaVerifier,
  PhoneAuthProvider,
  linkWithCredential
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
  firebaseConfig.apiKey &&
  !firebaseConfig.apiKey.startsWith("PASTE_") &&
  firebaseConfig.projectId &&
  !firebaseConfig.projectId.startsWith("PASTE_");

let auth, db;
let recaptchaVerifier = null;
let phoneVerificationId = null;

const $ = id => document.getElementById(id);

let mode = "login";

let posts = JSON.parse(localStorage.getItem("gg_posts") || "null") || [
  { user: "Ayaan Ghost", caption: "Living in my own world 👻", img: "", likes: 1250 },
  { user: "Zoya", caption: "Green lights, calm nights 💚", img: "", likes: 842 }
];

let photoData = "";

function setStatus(t, error = false) {
  if (!$("authStatus")) return;
  $("authStatus").textContent = t;
  $("authStatus").className = "status " + (error ? "error" : "");
}

function authAlias(username) {
  return `${username.toLowerCase()}@ghostgram.invalid`;
}

// FIREBASE START

if (configured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  onAuthStateChanged(auth, user => {
    if (user) enterApp(user);
    else showAuth();
  });
} else {
  setStatus("Firebase setup needed. Check firebase-config.js.", true);
}

// LOGIN / SIGNUP MODE

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
    setStatus("Finish Firebase setup first.", true);
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

      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw Error("Enter a valid recovery email.");

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
        throw Error("This is an older account. Contact support.");

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
    "Password reset is not available yet for username-based accounts. Keep your password safe.",
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

// FRIENDLY ERROR MESSAGES

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
    return "Firestore permission denied. Check your Firestore Rules.";

  if (c.includes("invalid-phone-number"))
    return "Enter a valid phone number with country code, e.g. +91.";

  if (c.includes("too-many-requests"))
    return "Too many attempts. Please try again later.";

  if (c.includes("captcha-check-failed"))
    return "reCAPTCHA failed. Refresh the page and try again.";

  if (c.includes("credential-already-in-use"))
    return "This phone number is already linked to another account.";

  if (c.includes("provider-already-linked"))
    return "A phone number is already linked to this account.";

  if (c.includes("invalid-verification-code"))
    return "Incorrect OTP. Please check and try again.";

  return e.message || "Something went wrong.";
}

// AUTH SCREEN

function showAuth() {
  $("auth").hidden = false;
  $("app").hidden = true;
}

// ENTER APP

async function enterApp(user) {
  $("auth").hidden = true;
  $("app").hidden = false;

  $("profileName").textContent = user.displayName || "GhostGram user";

  $("profileEmail").textContent =
    user.email?.endsWith("@ghostgram.invalid")
      ? "@" + (user.displayName || "ghost")
      : user.email || "";

  $("displayName").value = user.displayName || "";

  // Load saved recovery details
  try {
    const snap = await getDoc(doc(db, "users", user.uid));

    if (snap.exists()) {
      const data = snap.data();

      if ($("recoveryEmail"))
        $("recoveryEmail").value = data.recoveryEmail || "";

      if ($("recoveryPhone"))
        $("recoveryPhone").value = user.phoneNumber || data.recoveryPhone || "";
    }
  } catch (e) {
    console.error("Profile load error:", e);
  }

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
  if (!e) return;

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
        ? `<img class="post-img" src="${p.img}" alt="Post image">`
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
  localStorage.setItem("gg_posts", JSON.stringify(posts));
  renderFeed();
};

// PHOTO PREVIEW

window.previewPhoto = e => {
  const f = e.target.files[0];

  if (!f) return;

  if (f.size > 2 * 1024 * 1024) {
    toast("Choose an image under 2 MB");
    e.target.value = "";
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
    $("profileEmail").textContent =
      auth.currentUser.email?.endsWith("@ghostgram.invalid")
        ? "@" + n
        : auth.currentUser.email || "";

    toast("Profile updated");

  } catch (e) {
    toast(friendly(e));
  }
};

// SAVE RECOVERY EMAIL
// This saves the email as profile information.
// It does NOT verify the email or enable password reset.

window.addRecoveryEmail = async () => {
  const user = auth?.currentUser;
  const email = $("recoveryEmail").value.trim().toLowerCase();

  if (!user) return toast("Please log in first.");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return toast("Enter a valid email address.");

  try {
    await setDoc(doc(db, "users", user.uid), {
      recoveryEmail: email,
      recoveryEmailUpdatedAt: serverTimestamp()
    }, { merge: true });

    $("emailSecurityStatus").textContent =
      "Email saved. Verification and password recovery are not enabled yet.";

    toast("Recovery email saved");

  } catch (e) {
    $("emailSecurityStatus").textContent = friendly(e);
  }
};

// SEND PHONE OTP

window.sendPhoneCode = async () => {
  const user = auth?.currentUser;
  const phone = $("recoveryPhone").value.trim();

  if (!user) return toast("Please log in first.");

  if (!/^\+[1-9]\d{7,14}$/.test(phone))
    return toast("Use country code format, e.g. +91XXXXXXXXXX.");

  try {
    $("phoneSecurityStatus").textContent = "Preparing phone verification...";

    if (user.phoneNumber) {
      throw Error("A phone number is already linked to this account.");
    }

    if (recaptchaVerifier) {
      recaptchaVerifier.clear();
      recaptchaVerifier = null;
    }

    recaptchaVerifier = new RecaptchaVerifier(
      auth,
      "phoneRecaptcha",
      { size: "normal" }
    );

    const provider = new PhoneAuthProvider(auth);

    phoneVerificationId = await provider.verifyPhoneNumber(
      phone,
      recaptchaVerifier
    );

    $("phoneOTP").hidden = false;
    $("verifyPhoneButton").hidden = false;

    $("phoneSecurityStatus").textContent =
      "OTP sent. Enter the code in GhostGram.";

    toast("OTP sent");

  } catch (e) {
    $("phoneSecurityStatus").textContent = friendly(e);

    if (recaptchaVerifier) {
      recaptchaVerifier.clear();
      recaptchaVerifier = null;
    }
  }
};

// VERIFY OTP AND LINK PHONE TO CURRENT ACCOUNT

window.verifyPhoneCode = async () => {
  const user = auth?.currentUser;
  const code = $("phoneOTP").value.trim();

  if (!user) return toast("Please log in first.");

  if (!phoneVerificationId)
    return toast("First request an OTP.");

  if (!/^\d{6}$/.test(code))
    return toast("Enter the 6-digit OTP.");

  try {
    $("verifyPhoneButton").disabled = true;

    const credential = PhoneAuthProvider.credential(
      phoneVerificationId,
      code
    );

    const result = await linkWithCredential(user, credential);

    await setDoc(doc(db, "users", result.user.uid), {
      recoveryPhone: result.user.phoneNumber,
      phoneVerified: true,
      phoneVerifiedAt: serverTimestamp()
    }, { merge: true });

    $("recoveryPhone").value = result.user.phoneNumber || "";
    $("phoneOTP").value = "";
    $("phoneOTP").hidden = true;
    $("verifyPhoneButton").hidden = true;

    $("phoneSecurityStatus").textContent =
      "Phone number verified and linked to your account.";

    phoneVerificationId = null;

    if (recaptchaVerifier) {
      recaptchaVerifier.clear();
      recaptchaVerifier = null;
    }

    toast("Phone verified successfully");

  } catch (e) {
    $("phoneSecurityStatus").textContent = friendly(e);

  } finally {
    $("verifyPhoneButton").disabled = false;
  }
};

// PROFILE

function renderProfile() {
  const username = auth?.currentUser?.displayName;

  $("postCount").textContent = posts.filter(
    p => p.user === username
  ).length;

  $("myPosts").innerHTML = posts.filter(
    p => p.user === username
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

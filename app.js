
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
  addDoc,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  deleteDoc,
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
let posts = [];
let postsUnsubscribe = null;

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

  if (c.includes("email-already-in-use"))
    return "That username is already registered. Please log in.";

  if (c.includes("weak-password"))
    return "Use a password with at least 6 characters.";

  if (c.includes("invalid-credential") || c.includes("wrong-password"))
    return "Incorrect username or password.";

  if (c.includes("popup"))
    return "Google sign-in popup was blocked. Allow popups and try again.";

  if (c.includes("permission-denied"))
    return "Firestore permission denied. Check your Firestore Rules.";

  if (c.includes("too-many-requests"))
    return "Too many attempts. Please try again later.";

  if (c.includes("app-not-authorized"))
    return "This website domain is not authorized in Firebase Authentication.";

  if (c.includes("network-request-failed"))
    return "Network error. Check your internet connection and try again.";

  if (c.includes("missing-email"))
    return "Login details are missing. Refresh GhostGram and try again.";

  return e?.message || "Something went wrong. Please try again.";
}

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

  $("submitAuth").textContent =
    m === "login" ? "Log in" : "Create account";

  $("password").autocomplete =
    m === "login" ? "current-password" : "new-password";

  $("resetButton").hidden = m === "signup";

  setStatus("");
};

$("authForm").addEventListener("submit", async e => {
  e.preventDefault();

  if (!configured || !auth || !db) {
    return setStatus(
      "Firebase setup is incomplete. Check firebase-config.js.",
      true
    );
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

      if (!/^[a-z0-9_]{3,20}$/.test(uname))
        throw new Error("Username must be 3–20 characters: letters, numbers or underscore.");

      if (pass.length < 6)
        throw new Error("Password must be at least 6 characters.");

      if (pass !== confirm)
        throw new Error("Passwords do not match.");

      if (email && !validEmail(email))
        throw new Error("Enter a valid recovery email.");

      const usernameRef = doc(db, "usernames", uname);

      if ((await getDoc(usernameRef)).exists())
        throw new Error("That username is already taken.");

      const cred = await createUserWithEmailAndPassword(
        auth,
        authAlias(uname),
        pass
      );

      await updateProfile(cred.user, {
        displayName: uname
      });

      await setDoc(doc(db, "users", cred.user.uid), {
        username: uname,
        recoveryEmail: email || null,
        recoveryEmailStatus: email ? "not_verified" : "not_added",
        createdAt: serverTimestamp()
      });

      // Public username mapping contains UID only.
      await setDoc(usernameRef, {
        uid: cred.user.uid
      });

      setStatus("Account created successfully.");
      await enterApp(cred.user);

    } else {
      if (!/^[a-z0-9_]{3,20}$/.test(identity)) {
        throw new Error("Enter your GhostGram username.");
      }

      const cred = await signInWithEmailAndPassword(
        auth,
        authAlias(identity),
        pass
      );

      await enterApp(cred.user);
    }

  } catch (err) {
    console.error("Authentication error:", err);
    setStatus(friendly(err), true);

  } finally {
    button.disabled = false;
  }
});

window.resetPassword = () => {
  const username = window.prompt("Enter your GhostGram username:");

  if (username === null) return;

  const clean = username.trim().toLowerCase();

  if (!/^[a-z0-9_]{3,20}$/.test(clean)) {
    setStatus(
      "Enter a valid GhostGram username (3–20 letters, numbers or underscores).",
      true
    );
    return;
  }

  setStatus(
    "Automatic password reset is not available for username-based accounts yet. The saved recovery email is only a contact record, not a Firebase Auth reset address. Keep your password safe.",
    true
  );
};

window.googleSignIn = async () => {
  if (!configured || !auth || !db)
    return setStatus("Firebase setup is incomplete.", true);

  try {
    const result = await signInWithPopup(
      auth,
      new GoogleAuthProvider()
    );

    const userRef = doc(db, "users", result.user.uid);
    const existing = await getDoc(userRef);

    if (!existing.exists()) {
      const base = (result.user.displayName || "ghost")
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "")
        .slice(0, 14) || "ghost";

      let uname = `${base}_${result.user.uid.slice(0, 4)}`;

      let usernameSnap = await getDoc(
        doc(db, "usernames", uname)
      );

      if (
        usernameSnap.exists() &&
        usernameSnap.data().uid !== result.user.uid
      ) {
        uname = `${base}_${result.user.uid.slice(0, 8)}`;
      }

      await setDoc(userRef, {
        username: uname,
        recoveryEmail: result.user.email || null,
        recoveryEmailStatus: result.user.email
          ? "google_account_email"
          : "not_added",
        createdAt: serverTimestamp()
      });

      await setDoc(doc(db, "usernames", uname), {
        uid: result.user.uid
      });

    } else {
      const uname = existing.data()?.username;

      if (uname) {
        const usernameRef = doc(db, "usernames", uname);
        const usernameSnap = await getDoc(usernameRef);

        if (!usernameSnap.exists()) {
          await setDoc(usernameRef, {
            uid: result.user.uid
          });
        }
      }
    }

    await enterApp(result.user);

  } catch (e) {
    console.error("Google sign-in error:", e);
    setStatus(friendly(e), true);
  }
};

function showAuth() {
  $("auth").hidden = false;
  $("app").hidden = true;
}

async function enterApp(user) {
  $("auth").hidden = true;
  $("app").hidden = false;

  $("profileName").textContent =
    user.displayName || "GhostGram user";

  $("profileEmail").textContent =
    user.email?.endsWith("@ghostgram.invalid")
      ? "@" + (user.displayName || "ghost")
      : (user.email || "");

  $("displayName").value = user.displayName || "";

  try {
    const snap = await getDoc(doc(db, "users", user.uid));

    currentUserData = snap.exists() ? snap.data() : {};

    $("recoveryEmail").value =
      currentUserData.recoveryEmail || "";

    $("recoveryPhone").value =
      user.phoneNumber || currentUserData.recoveryPhone || "";

    updateEmailSecurityStatus();
    updatePhoneSecurityStatus(user);

  } catch (e) {
    console.error("Profile/security load error:", e);

    $("emailSecurityStatus").textContent =
      "Could not load security details. Check your connection and Firestore Rules.";
  }

  renderStories();
  startPostsListener();
  show("home");
}

function updateEmailSecurityStatus() {
  const email = currentUserData.recoveryEmail;
  const status = currentUserData.recoveryEmailStatus;

  if (!email) {
    $("emailSecurityStatus").textContent =
      "No recovery email saved.";
  } else if (status === "verified") {
    $("emailSecurityStatus").textContent =
      `Saved email: ${email} · Verified`;
  } else if (status === "google_account_email") {
    $("emailSecurityStatus").textContent =
      `Google account email: ${email}`;
  } else {
    $("emailSecurityStatus").textContent =
      `Saved email: ${email} · Not verified. It cannot receive GhostGram password-reset links yet.`;
  }
}

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

window.logout = async () => {
  try {
    if (postsUnsubscribe) {
      postsUnsubscribe();
      postsUnsubscribe = null;
    }

    if (auth) await signOut(auth);

    showAuth();

  } catch (e) {
    toast(friendly(e));
  }
};

window.show = id => {
  document.querySelectorAll(".page").forEach(p => {
    p.classList.toggle("active", p.id === id);
  });

  document.querySelectorAll(".tabs button").forEach(b => {
    b.classList.toggle("active", b.dataset.page === id);
  });

  if (id === "profile") renderProfile();
  if (id === "home") renderFeed();

  window.scrollTo(0, 0);
};

window.toast = message => {
  const el = $("toast");

  if (!el) return;

  el.textContent = message;
  el.style.display = "block";

  setTimeout(() => {
    el.style.display = "none";
  }, 2200);
};

function renderStories() {
  $("stories").innerHTML = [
    "Your story",
    "Ayaan",
    "Sameer",
    "Zoya",
    "Arman"
  ].map((name, i) => `
    <div class="story">
      <div class="ring">
        <div class="avatar">${i ? escapeHtml(name[0]) : "＋"}</div>
      </div>
      ${escapeHtml(name)}
    </div>
  `).join("");
}

function startPostsListener() {
  if (!db || !auth?.currentUser) return;

  if (postsUnsubscribe) postsUnsubscribe();

  const postsQuery = query(
    collection(db, "posts"),
    orderBy("createdAt", "desc"),
    limit(50)
  );

  postsUnsubscribe = onSnapshot(
    postsQuery,
    snapshot => {
      posts = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      }));

      renderFeed();
      renderProfile();
    },
    error => {
      console.error("Posts listener error:", error);
      toast("Could not load posts. Check Firestore Rules.");
    }
  );
}

function renderFeed() {
  const feed = $("feed");

  if (!feed) return;

  if (!posts.length) {
    feed.innerHTML =
      '<p class="muted">No posts yet. Be the first to share something!</p>';
    return;
  }

  feed.innerHTML = posts.map(p => `
    <article class="post">
      <div class="post-head">
        <div class="avatar">${escapeHtml(String(p.user || "G")[0])}</div>
        <div>
          <b>${escapeHtml(p.user || "GhostGram user")}</b>
          <small>
            GhostGram ·
            ${p.createdAt?.toDate
              ? p.createdAt.toDate().toLocaleString()
              : "just now"}
          </small>
        </div>
      </div>

      <div class="post-copy">
        <b>${Number(p.likes) || 0} likes</b><br>
        <b>${escapeHtml(p.user || "GhostGram user")}</b>
        ${escapeHtml(p.caption || "")}
      </div>

      ${
        p.uid === auth?.currentUser?.uid
          ? `<button type="button" class="logout" onclick="deletePost('${p.id}')">Delete post</button>`
          : ""
      }
    </article>
  `).join("");
}

window.deletePost = async id => {
  const post = posts.find(p => p.id === id);

  if (!post || post.uid !== auth?.currentUser?.uid) {
    return toast("You can delete only your own posts.");
  }

  try {
    await deleteDoc(doc(db, "posts", id));
    toast("Post deleted");

  } catch (e) {
    toast(friendly(e));
  }
};

window.createPost = async () => {
  const user = auth?.currentUser;
  const caption = $("caption").value.trim();

  if (!user) return toast("Please log in first.");

  if (!caption && !photoData) {
    return toast("Add a caption or photo");
  }

  if (photoData) {
    return toast(
      "This update syncs text posts first. Photo uploads need Firebase Storage setup."
    );
  }

  try {
    const button =
      document.querySelector("#createPostButton") ||
      document.querySelector('[onclick="createPost()"]');

    if (button) button.disabled = true;

    await addDoc(collection(db, "posts"), {
      uid: user.uid,
      user: user.displayName || currentUserData.username || "GhostGram user",
      caption,
      likes: 0,
      createdAt: serverTimestamp()
    });

    $("caption").value = "";
    show("home");
    toast("Post published to GhostGram!");

  } catch (e) {
    console.error("Create post error:", e);
    toast(friendly(e));

  } finally {
    const button =
      document.querySelector("#createPostButton") ||
      document.querySelector('[onclick="createPost()"]');

    if (button) button.disabled = false;
  }
};

window.searchPosts = queryText => {
  const found = posts.filter(p =>
    `${p.caption || ""} ${p.user || ""}`
      .toLowerCase()
      .includes(queryText.toLowerCase())
  );

  $("searchResults").innerHTML = found.map(p => `
    <div class="message">
      <b>${escapeHtml(p.user)}</b>
      <p>${escapeHtml(p.caption)}</p>
    </div>
  `).join("") || "No matching posts.";
};

window.saveProfile = async () => {
  const user = auth?.currentUser;
  const name = $("displayName").value.trim();

  if (!user) return toast("Please log in first.");
  if (!name) return toast("Enter a display name.");

  try {
    await updateProfile(user, { displayName: name });

    await setDoc(
      doc(db, "users", user.uid),
      { displayName: name },
      { merge: true }
    );

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

window.addRecoveryEmail = async () => {
  const user = auth?.currentUser;
  const email = $("recoveryEmail").value.trim().toLowerCase();

  if (!user) return toast("Please log in first.");
  if (!validEmail(email)) return toast("Enter a valid email address.");

  const button = $("recoveryEmailButton");

  try {
    button.disabled = true;

    await setDoc(
      doc(db, "users", user.uid),
      {
        recoveryEmail: email,
        recoveryEmailStatus: "not_verified",
        recoveryEmailUpdatedAt: serverTimestamp()
      },
      { merge: true }
    );

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

function renderProfile() {
  $("postCount").textContent = posts.filter(
    p => p.uid === auth?.currentUser?.uid
  ).length;

  $("myPosts").innerHTML = posts
    .filter(p => p.uid === auth?.currentUser?.uid)
    .map(p => `
      <div class="message">${escapeHtml(p.caption)}</div>
    `).join("") || '<p class="muted">Your posts will appear here.</p>';
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

window.setAuthMode("login");

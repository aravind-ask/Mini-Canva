# 🖌️ Stateless 2D Canvas Editor — Mini Canva

A lightweight, shareable **2D canvas editor** built with **React, Fabric.js, and Firebase Firestore**.  
Anyone with the link can **view and edit** the same canvas — no login required.

Live Demo: [https://mini-canva-x8hu.onrender.com/](https://your-demo-url.com)  

---

## ✨ Features

### **Core**
- Add **rectangles**, **circles**, **text**, and freehand drawings (**pen tool**)
- Move, resize, rotate, and delete objects
- Edit **text content** and **object colors**
- Auto-save to **Firebase Firestore** under a unique scene ID
- Load and edit any shared canvas via `/canvas/:id`

### **Shareability**
- Generate a new canvas link on `/`
- "Share Canvas" button copies the live link to clipboard
- Anyone with the link can edit — no authentication

### **Bonus Features**
- ✅ **Undo / Redo** (basic history stack)
- ✅ **Export PNG / SVG** for download
- ✅ **Snap-to-grid** for precise alignment
- ✅ **View-only mode** (`?viewOnly=true` disables editing)
- ✅ **Object locking** (prevent accidental edits)

---

## 🛠 Tech Stack
- **React** — UI framework
- **Fabric.js** — Canvas rendering & object manipulation
- **Firebase Firestore** — Persistence layer
- **Vite** — Development bundler
- **Lodash.debounce** — Optimized Firestore writes

---


## ⚙️ How It Works
1. **New Scene Creation**
   - Visiting `/` generates a **unique scene ID** using `nanoid`
   - Redirects to `/canvas/:id`

2. **Persistence**
   - Canvas state (`fabric.Canvas.toJSON()`) is saved in `scenes/{sceneId}` in Firestore
   - Changes are **debounced** to reduce write operations
   - Auto-loads saved scene JSON when visiting `/canvas/:id`

3. **Editing**
   - Toolbar allows adding shapes/text and activating pen mode
   - Objects can be styled via color picker
   - All object changes trigger an auto-save

4. **Share**
   - "Share Canvas" copies the URL
   - Adding `?viewOnly=true` makes the canvas **non-editable**

---

## 🧠 Trade-offs & Decisions
- **Stateless links (no auth)**: Easy sharing, zero friction.  
  ➡️ Trade-off: Anyone with the link can overwrite changes. No per-user history.
- **Full JSON save**: Simpler implementation, but not optimal for large canvases.  
  ➡️ Could be improved with per-object diff updates.
- **Debounce writes**: Reduces Firestore costs and avoids lag.  
  ➡️ Slight delay before changes are saved.
- **No real-time sync**: Current version requires refresh to see other users' changes.  
  ➡️ Real-time listeners could be added for live collaboration.

---

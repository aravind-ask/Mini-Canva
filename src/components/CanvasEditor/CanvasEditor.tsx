import React, { useEffect, useRef, useState } from "react";
import * as fabric from "fabric";
import { db } from "../../firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { useParams, useNavigate } from "react-router-dom";

const CanvasEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const [activeTool, setActiveTool] = useState<
    "select" | "rectangle" | "circle" | "text" | "pen"
  >("select");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [undoStackLength, setUndoStackLength] = useState(0);
  const [redoStackLength, setRedoStackLength] = useState(0);
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const isUndoingRedoing = useRef(false);

  const updateStackLengths = () => {
    setUndoStackLength(undoStack.current.length);
    setRedoStackLength(redoStack.current.length);
  };

  const createNewCanvas = () => {
    navigate("/");
  };

  const debounceSave = () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setIsSaving(true);
    saveTimeoutRef.current = setTimeout(() => {
      saveCanvas().finally(() => setIsSaving(false));
    }, 500);
  };

  const saveCanvas = async () => {
    if (!id || !fabricCanvasRef.current) return;

    try {
      const canvasData = fabricCanvasRef.current.toObject([
        "selectable",
        "evented",
        "hoverCursor",
        "lockMovementX",
        "lockMovementY",
        "hasControls",
        "lockRotation",
        "lockScalingX",
        "lockScalingY",
      ]);

      // Sanitize objects for Firestore
      if (canvasData.objects) {
        canvasData.objects = canvasData.objects.map((obj: any) => {
          if (obj.type === "path" && obj.path) {
            // Encode path as a JSON string to avoid nested arrays
            return {
              ...obj,
              path: JSON.stringify(obj.path),
            };
          }
          return {
            ...obj,
            styles: null,
            path: obj.type === "path" ? obj.path : null,
            textBackgroundColor: null,
          };
        });
      }

      // Remove undefined values
      const sanitizedCanvas = JSON.parse(
        JSON.stringify(canvasData, (key, value) =>
          value === undefined ? null : value
        )
      );

      await setDoc(doc(db, "canvases", id), {
        canvas: sanitizedCanvas,
        lastUpdated: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Save failed:", err);
      setError("Failed to save canvas. Please try again.");
      setTimeout(() => setError(null), 3000);
    }
  };

  const saveState = () => {
    if (!fabricCanvasRef.current || isUndoingRedoing.current || isViewOnly)
      return;

    const json = JSON.stringify(
      fabricCanvasRef.current.toObject([
        "selectable",
        "evented",
        "hoverCursor",
        "lockMovementX",
        "lockMovementY",
        "hasControls",
        "lockRotation",
        "lockScalingX",
        "lockScalingY",
      ])
    );
    undoStack.current.push(json);
    redoStack.current = [];
    updateStackLengths();
    debounceSave();
  };

  const undo = async () => {
    if (undoStack.current.length <= 1 || !fabricCanvasRef.current || isViewOnly)
      return;

    isUndoingRedoing.current = true;
    try {
      const currentState = undoStack.current.pop();
      if (currentState) {
        redoStack.current.push(currentState);
      }

      const prevState = undoStack.current[undoStack.current.length - 1];
      if (!prevState) return;

      await fabricCanvasRef.current.loadFromJSON(JSON.parse(prevState));
      fabricCanvasRef.current.renderAll();
      updateStackLengths();
      if (activeTool === "pen") enablePenTool();
    } catch (error) {
      console.error("Undo failed:", error);
      setError("Failed to undo. Please try again.");
      setTimeout(() => setError(null), 3000);
    } finally {
      isUndoingRedoing.current = false;
      await saveCanvas();
    }
  };

  const redo = async () => {
    if (
      redoStack.current.length === 0 ||
      !fabricCanvasRef.current ||
      isViewOnly
    )
      return;

    isUndoingRedoing.current = true;
    try {
      const nextState = redoStack.current.pop();
      if (!nextState) return;

      await fabricCanvasRef.current.loadFromJSON(JSON.parse(nextState));
      fabricCanvasRef.current.renderAll();
      undoStack.current.push(nextState);
      updateStackLengths();
      if (activeTool === "pen") enablePenTool();
    } catch (error) {
      console.error("Redo failed:", error);
      setError("Failed to redo. Please try again.");
      setTimeout(() => setError(null), 3000);
    } finally {
      isUndoingRedoing.current = false;
      await saveCanvas();
    }
  };

  const toggleLock = () => {
    if (isViewOnly) return;

    const activeObject = fabricCanvasRef.current?.getActiveObject();
    if (activeObject) {
      const isLocked = activeObject.lockMovementX;
      activeObject.set({
        selectable: !isLocked,
        evented: !isLocked,
        lockMovementX: !isLocked,
        lockMovementY: !isLocked,
        hasControls: !isLocked,
        lockRotation: !isLocked,
        lockScalingX: !isLocked,
        lockScalingY: !isLocked,
      });

      // If unlocking, select the object
      if (isLocked) {
        fabricCanvasRef.current?.setActiveObject(activeObject);
      } else {
        // If locking, deselect the object
        fabricCanvasRef.current?.discardActiveObject();
      }

      fabricCanvasRef.current?.renderAll();
      saveState();
    }
  };

  const applyViewOnlyMode = () => {
    if (!fabricCanvasRef.current) return;

    fabricCanvasRef.current.selection = false;
    fabricCanvasRef.current.hoverCursor = "default";
    fabricCanvasRef.current.interactive = false;
    fabricCanvasRef.current.isDrawingMode = false;
    fabricCanvasRef.current.skipTargetFind = true;
    fabricCanvasRef.current.defaultCursor = "default";

    fabricCanvasRef.current.forEachObject((obj) => {
      obj.set({
        selectable: false,
        evented: false,
        hoverCursor: "default",
        lockMovementX: true,
        lockMovementY: true,
        hasControls: false,
        hasBorders: false,
        lockRotation: true,
        lockScalingX: true,
        lockScalingY: true,
        lockUniScaling: true,
        lockScalingFlip: true,
        lockSkewingX: true,
        lockSkewingY: true,
      });
    });

    fabricCanvasRef.current.discardActiveObject();
    fabricCanvasRef.current.renderAll();
  };

  useEffect(() => {
    if (!canvasRef.current) return;

    fabricCanvasRef.current = new fabric.Canvas(canvasRef.current, {
      width: window.innerWidth - 200,
      height: window.innerHeight - 100,
      backgroundColor: "#f3f3f3",
      interactive: !isViewOnly,
    });

    const params = new URLSearchParams(window.location.search);
    const viewOnlyParam = params.get("viewOnly") === "true";
    setIsViewOnly(viewOnlyParam);

    if (viewOnlyParam) {
      applyViewOnlyMode();
    } else {
      const gridSize = 20;
      fabricCanvasRef.current.on("object:moving", (e) => {
        const obj = e.target;
        if (obj) {
          obj.set({
            left: Math.round(obj.left! / gridSize) * gridSize,
            top: Math.round(obj.top! / gridSize) * gridSize,
          });
        }
      });
    }

    const handleChange = () => {
      if (!isViewOnly) {
        saveState();
      }
    };

    fabricCanvasRef.current.on("object:added", handleChange);
    fabricCanvasRef.current.on("object:modified", handleChange);
    fabricCanvasRef.current.on("object:removed", handleChange);
    fabricCanvasRef.current.on("path:created", handleChange);

    const loadCanvas = async () => {
      if (!id) return;

      setIsLoading(true);
      try {
        const docRef = doc(db, "canvases", id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          let json = docSnap.data()?.canvas;
          if (json && fabricCanvasRef.current) {
            // Restore path data from string
            if (json.objects) {
              json.objects = json.objects.map((obj: any) => {
                if (
                  obj.type === "path" &&
                  obj.path &&
                  typeof obj.path === "string"
                ) {
                  try {
                    const parsedPath = JSON.parse(obj.path);
                    // Ensure path is in the correct format for Fabric.js
                    if (
                      Array.isArray(parsedPath) &&
                      parsedPath.every((cmd: any) => Array.isArray(cmd))
                    ) {
                      return {
                        ...obj,
                        path: parsedPath,
                      };
                    }
                    console.warn("Invalid path data format:", obj.path);
                    return obj;
                  } catch (e) {
                    console.warn("Failed to parse path data:", e);
                    return obj;
                  }
                }
                return obj;
              });
            }
            await fabricCanvasRef.current.loadFromJSON(json, () => {
              fabricCanvasRef.current?.renderAll();
            });
            if (activeTool === "pen") enablePenTool();
            if (isViewOnly) {
              applyViewOnlyMode();
            } else {
              fabricCanvasRef.current.renderAll();
            }
            undoStack.current = [
              JSON.stringify(
                fabricCanvasRef.current.toObject([
                  "selectable",
                  "evented",
                  "hoverCursor",
                  "lockMovementX",
                  "lockMovementY",
                  "hasControls",
                  "lockRotation",
                  "lockScalingX",
                  "lockScalingY",
                ])
              ),
            ];
            updateStackLengths();
          }
        }
      } catch (err) {
        console.error("Load failed:", err);
        setError("Failed to load canvas. Please refresh.");
      } finally {
        setIsLoading(false);
      }
    };

    loadCanvas();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isViewOnly) return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.key === "z") {
          undo();
        } else if (e.key === "y") {
          redo();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      fabricCanvasRef.current?.off("object:added", handleChange);
      fabricCanvasRef.current?.off("object:modified", handleChange);
      fabricCanvasRef.current?.off("object:removed", handleChange);
      fabricCanvasRef.current?.off("path:created", handleChange);
      fabricCanvasRef.current?.dispose();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [id, isViewOnly]);

  const addShape = (type: "rectangle" | "circle" | "text") => {
    if (isViewOnly) return;

    let shape: fabric.Object;
    switch (type) {
      case "rectangle":
        shape = new fabric.Rect({
          left: 100,
          top: 100,
          width: 100,
          height: 100,
          fill: "#ff5555",
        });
        break;
      case "circle":
        shape = new fabric.Circle({
          left: 100,
          top: 100,
          radius: 50,
          fill: "#55ff55",
        });
        break;
      case "text":
        shape = new fabric.Textbox("Edit me", {
          left: 100,
          top: 100,
          width: 150,
          fontSize: 20,
          fill: "#5555ff",
          styles: null,
          path: null,
          textBackgroundColor: null,
          textAlign: "left",
        });
        break;
    }
    fabricCanvasRef.current?.add(shape);
    fabricCanvasRef.current?.setActiveObject(shape);
    setActiveTool("select");
  };

  const enablePenTool = () => {
    if (isViewOnly || !fabricCanvasRef.current) return;

    fabricCanvasRef.current.isDrawingMode = true;
    fabricCanvasRef.current.freeDrawingBrush = new fabric.PencilBrush(
      fabricCanvasRef.current
    );
    fabricCanvasRef.current.freeDrawingBrush.width = 5;
    fabricCanvasRef.current.freeDrawingBrush.color = "#000000";
    setActiveTool("pen");
  };

  const deleteSelected = () => {
    if (isViewOnly) return;

    const activeObject = fabricCanvasRef.current?.getActiveObject();
    if (activeObject) {
      // Check if object is locked
      if (activeObject.lockMovementX && activeObject.lockMovementY) {
        return; // Don't delete locked objects
      }
      fabricCanvasRef.current?.remove(activeObject);
    }
  };

  const changeColor = (color: string) => {
    if (isViewOnly) return;

    const activeObject = fabricCanvasRef.current?.getActiveObject();
    if (activeObject) {
      // Check if object is locked
      if (activeObject.lockMovementX && activeObject.lockMovementY) {
        return; // Don't change color of locked objects
      }
      activeObject.set("fill", color);
      activeObject.dirty = true;
      fabricCanvasRef.current?.fire("object:modified", {
        target: activeObject,
      });
      fabricCanvasRef.current?.renderAll();
    }
  };

  const exportCanvas = () => {
    if (fabricCanvasRef.current) {
      const dataURL = fabricCanvasRef.current.toDataURL({
        format: "png",
        quality: 1.0,
      });
      const link = document.createElement("a");
      link.href = dataURL;
      link.download = "canvas.png";
      link.click();
    }
  };

  const shareCanvas = (viewOnly = false) => {
    const url = `${window.location.origin}/canvas/${id}${
      viewOnly ? "?viewOnly=true" : ""
    }`;
    navigator.clipboard.writeText(url);
    alert(`Copied ${viewOnly ? "view-only" : "editable"} link to clipboard!`);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <div className="bg-gray-700 text-white p-2 text-sm flex justify-between">
        <div>
          {isLoading && "Loading canvas..."}
          {isSaving && "Saving changes..."}
          {error && <span className="text-red-300">{error}</span>}
          {isViewOnly && <span className="text-blue-300">View Only Mode</span>}
        </div>
        <div>
          {!isViewOnly &&
            undoStackLength > 1 &&
            `Undo (${undoStackLength - 1})`}
          {!isViewOnly && redoStackLength > 0 && ` | Redo (${redoStackLength})`}
        </div>
      </div>
      <div className="bg-gray-800 text-white p-4 flex justify-between items-center">
        <div className="space-x-2">
          <button
            className={`px-4 py-2 rounded ${
              activeTool === "select" ? "bg-blue-500" : "bg-gray-600"
            } hover:bg-blue-600 transition`}
            onClick={() => {
              if (fabricCanvasRef.current) {
                fabricCanvasRef.current.isDrawingMode = false;
              }
              setActiveTool("select");
            }}
            disabled={isViewOnly}
          >
            Select
          </button>
          <button
            className={`px-4 py-2 rounded ${
              activeTool === "rectangle" ? "bg-blue-500" : "bg-gray-600"
            } hover:bg-blue-600 transition`}
            onClick={() => addShape("rectangle")}
            disabled={isViewOnly}
          >
            Rectangle
          </button>
          <button
            className={`px-4 py-2 rounded ${
              activeTool === "circle" ? "bg-blue-500" : "bg-gray-600"
            } hover:bg-blue-600 transition`}
            onClick={() => addShape("circle")}
            disabled={isViewOnly}
          >
            Circle
          </button>
          <button
            className={`px-4 py-2 rounded ${
              activeTool === "text" ? "bg-blue-500" : "bg-gray-600"
            } hover:bg-blue-600 transition`}
            onClick={() => addShape("text")}
            disabled={isViewOnly}
          >
            Text
          </button>
          <button
            className={`px-4 py-2 rounded ${
              activeTool === "pen" ? "bg-blue-500" : "bg-gray-600"
            } hover:bg-blue-600 transition`}
            onClick={enablePenTool}
            disabled={isViewOnly}
          >
            Pen
          </button>
          <button
            className="px-4 py-2 rounded bg-red-500 hover:bg-red-600 transition"
            onClick={deleteSelected}
            disabled={isViewOnly}
          >
            Delete
          </button>
          <button
            className="px-4 py-2 rounded bg-yellow-500 hover:bg-yellow-600 transition"
            onClick={toggleLock}
            disabled={isViewOnly}
          >
            Lock/Unlock
          </button>
          <button
            className={`px-4 py-2 rounded ${
              undoStackLength <= 1 || isViewOnly
                ? "bg-gray-600 cursor-not-allowed"
                : "bg-indigo-500 hover:bg-indigo-600 transition"
            }`}
            onClick={undo}
            disabled={undoStackLength <= 1 || isViewOnly}
          >
            Undo
          </button>
          <button
            className={`px-4 py-2 rounded ${
              redoStackLength === 0 || isViewOnly
                ? "bg-gray-600 cursor-not-allowed"
                : "bg-purple-500 hover:bg-purple-600 transition"
            }`}
            onClick={redo}
            disabled={redoStackLength === 0 || isViewOnly}
          >
            Redo
          </button>
        </div>
        <div className="space-x-2 flex items-center">
          <input
            type="color"
            onChange={(e) => changeColor(e.target.value)}
            className="h-10 w-10 rounded"
            disabled={isViewOnly}
          />
          <button
            className="px-4 py-2 rounded bg-green-500 hover:bg-green-600 transition"
            onClick={exportCanvas}
          >
            Export PNG
          </button>
          {!isViewOnly && (
            <>
              <button
                className="px-4 py-2 rounded bg-blue-500 hover:bg-blue-600 transition"
                onClick={() => shareCanvas(false)}
              >
                Share Editable
              </button>
              <button
                className="px-4 py-2 rounded bg-blue-400 hover:bg-blue-500 transition"
                onClick={() => shareCanvas(true)}
              >
                Share View-Only
              </button>
            </>
          )}
          <button
            className="px-4 py-2 rounded bg-orange-500 hover:bg-orange-600 transition"
            onClick={createNewCanvas}
          >
            New Canvas
          </button>
        </div>
      </div>
      <canvas ref={canvasRef} className="border border-gray-300 m-4" />
    </div>
  );
};

export default CanvasEditor;

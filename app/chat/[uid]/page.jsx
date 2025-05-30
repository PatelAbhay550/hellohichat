"use client";

import React, { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { auth, db, storage } from "@/lib/firebase";
import { IoIosArrowRoundBack } from "react-icons/io";
import Link from "next/link";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  deleteDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { v4 as uuidv4 } from "uuid";
import {
  FaPaperPlane,
  FaImage,
  FaTimesCircle,
  FaMicrophone,
  FaPlayCircle,
  FaPauseCircle,
  FaEdit,
  FaTrashAlt,
  FaCheckDouble,
  FaSun,
  FaMoon,
  FaThumbtack,
} from "react-icons/fa";
import { useReactMediaRecorder } from "react-media-recorder";

const ChatWithUser = () => {
  const { uid: receiverUid } = useParams();
  const currentUser = auth.currentUser;
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const messagesEndRef = useRef(null);
  const [receiverData, setReceiverData] = useState(null);
  const [pinnedMessages, setPinnedMessages] = useState([]);

  // Audio states
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioPlayerRef = useRef(null);
  const [currentPlayingAudioUrl, setCurrentPlayingAudioUrl] = useState(null);

  // Message Editing States
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingMessageText, setEditingMessageText] = useState("");
  const [longPressedMessageId, setLongPressedMessageId] = useState(null);

  // Theme State
  const [theme, setTheme] = useState("light");
  const [systemTheme, setSystemTheme] = useState(null);

  // Audio recording using react-media-recorder
  const {
    status: recordingStatus,
    startRecording,
    stopRecording,
    mediaBlobUrl,
    clearBlobUrl,
  } = useReactMediaRecorder({
    audio: true,
    blobPropertyBag: { type: "audio/webm" },
    onStop: () => {
      setShowAudioPopup(true);
    },
  });
  // Audio popup state
  const [showAudioPopup, setShowAudioPopup] = useState(false);

  // Fetch and listen to system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemTheme(mediaQuery.matches ? "dark" : "light");

    const handler = (e) => {
      setSystemTheme(e.matches ? "dark" : "light");
      const savedTheme = localStorage.getItem("chatTheme");
      if (!savedTheme) {
        setTheme(e.matches ? "dark" : "light");
      }
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // Initialize theme
  useEffect(() => {
    const savedTheme = localStorage.getItem("chatTheme");
    if (savedTheme) {
      setTheme(savedTheme);
    } else {
      setTheme(systemTheme || "light");
    }
  }, [systemTheme]);

  // Apply theme
  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("chatTheme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === "light" ? "dark" : "light"));
  };

  // Fetch receiver data
  useEffect(() => {
    const fetchReceiverData = async () => {
      if (!receiverUid) return;
      try {
        const docRef = doc(db, "hellohi-users", receiverUid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setReceiverData(docSnap.data());
        } else {
          console.log("No such receiver document!");
        }
      } catch (error) {
        console.error("Error fetching receiver data:", error);
      }
    };
    fetchReceiverData();
  }, [receiverUid]);

  // Fetch pinned messages
  useEffect(() => {
    if (!currentUser || !receiverUid) return;

    const fetchPinnedMessages = async () => {
      try {
        const pinnedRef = collection(db, "hellohi-pinned-messages");
        const q = query(
          pinnedRef,
          where("chatId", "==", `${currentUser.uid}_${receiverUid}`)
        );

        const unsub = onSnapshot(q, (snapshot) => {
          const pinned = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          setPinnedMessages(pinned);
        });

        return unsub;
      } catch (error) {
        console.error("Error fetching pinned messages:", error);
      }
    };

    fetchPinnedMessages();
  }, [currentUser, receiverUid]);

  // Subscribe to messages
  useEffect(() => {
    if (!currentUser || !receiverUid) return;

    const messagesRef = collection(db, "hellohi-messages");
    const q = query(
      messagesRef,
      where("participants", "array-contains", currentUser.uid),
      orderBy("timestamp")
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const filtered = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter(
          (msg) =>
            (msg.sender === currentUser.uid && msg.receiver === receiverUid) ||
            (msg.sender === receiverUid && msg.receiver === currentUser.uid)
        );
      setMessages(filtered);

      // Mark messages as seen
      filtered.forEach(async (msg) => {
        if (msg.receiver === currentUser.uid && msg.status !== "seen") {
          try {
            const messageDocRef = doc(db, "hellohi-messages", msg.id);
            await updateDoc(messageDocRef, { status: "seen" });
          } catch (error) {
            console.error("Error updating message status:", error);
          }
        }
      });
    });

    return () => unsub();
  }, [receiverUid, currentUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      setImagePreview(URL.createObjectURL(file));
    } else {
      setImage(null);
      setImagePreview(null);
    }
  };

  const removeImage = () => {
    setImage(null);
    setImagePreview(null);
    const fileInput = document.getElementById("imageUpload");
    if (fileInput) fileInput.value = "";
  };

  const compressImage = async (file) => {
    try {
      const imageBitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");

      const MAX_WIDTH = 1920;
      const MAX_HEIGHT = 1080;
      let { width, height } = imageBitmap;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height = height * (MAX_WIDTH / width);
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width = width * (MAX_HEIGHT / height);
          height = MAX_HEIGHT;
        }
      }
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(imageBitmap, 0, 0, width, height);

      return new Promise((resolve) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(
                new File([blob], file.name.replace(/\.[^/.]+$/, ".webp"), {
                  type: "image/webp",
                })
              );
            } else {
              resolve(file);
            }
          },
          "image/webp",
          0.7
        );
      });
    } catch (error) {
      console.error("Image compression error:", error);
      return file;
    }
  };

  const handleSend = async (audioFile = null) => {
    if (!text.trim() && !image && !audioFile) return;
    if (!currentUser || !receiverUid) {
      console.error("User or receiver not defined");
      return;
    }

    let imageUrl = null;
    let audioUrl = null;

    try {
      if (image) {
        const compressedImage = await compressImage(image);
        const imgRef = ref(storage, `chat-images/${uuidv4()}.webp`);
        await uploadBytes(imgRef, compressedImage);
        imageUrl = await getDownloadURL(imgRef);
      }

      if (audioFile) {
        const audioRef = ref(storage, `chat-audios/${uuidv4()}.webm`);
        await uploadBytes(audioRef, audioFile);
        audioUrl = await getDownloadURL(audioRef);
      }

      await addDoc(collection(db, "hellohi-messages"), {
        text: text.trim(),
        image: imageUrl,
        audio: audioUrl,
        sender: currentUser.uid,
        receiver: receiverUid,
        participants: [currentUser.uid, receiverUid],
        timestamp: serverTimestamp(),
        status: "sent",
        edited: false,
      });

      // Update chattedWith for both users
      const senderRef = doc(db, "hellohi-users", currentUser.uid);
      await updateDoc(senderRef, { chattedWith: arrayUnion(receiverUid) });
      const receiverRef = doc(db, "hellohi-users", receiverUid);
      await updateDoc(receiverRef, {
        chattedWith: arrayUnion(currentUser.uid),
      });

      setText("");
      setImage(null);
      setImagePreview(null);
      removeImage();
      clearBlobUrl();
      setShowAudioPopup(false);
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  // Handle audio playback
  const togglePlayAudio = (url) => {
    if (currentPlayingAudioUrl === url) {
      audioPlayerRef.current?.pause();
      setIsPlayingAudio(false);
      setCurrentPlayingAudioUrl(null);
    } else {
      setCurrentPlayingAudioUrl(url);
      setIsPlayingAudio(true);
      setTimeout(() => {
        audioPlayerRef.current?.play();
      }, 0);
    }
  };

  // Handle audio ended
  const handleAudioEnded = () => {
    setIsPlayingAudio(false);
    setCurrentPlayingAudioUrl(null);
  };

  // Handle send audio
  const handleSendAudio = async () => {
    if (!mediaBlobUrl) return;

    // Stop audio playback if playing the recorded audio
    if (audioPlayerRef.current && currentPlayingAudioUrl === mediaBlobUrl) {
      audioPlayerRef.current.pause();
      setIsPlayingAudio(false);
      setCurrentPlayingAudioUrl(null);
    }

    try {
      const response = await fetch(mediaBlobUrl);
      const blob = await response.blob();
      const audioFile = new File([blob], "recording.webm", {
        type: "audio/webm",
      });
      await handleSend(audioFile);
    } catch (error) {
      console.error("Error sending audio message:", error);
    }
  };

  // Cancel audio recording
  const cancelAudioRecording = () => {
    clearBlobUrl();
    setShowAudioPopup(false);
  };

  // Message actions
  const handleLongPress = (e, messageId, messageText, senderId) => {
    e.preventDefault();
    if (senderId === currentUser?.uid) {
      setLongPressedMessageId(messageId);
      setEditingMessageText(messageText || "");
    }
  };

  const handleEditMessage = async () => {
    if (editingMessageId && editingMessageText.trim()) {
      try {
        const messageRef = doc(db, "hellohi-messages", editingMessageId);
        await updateDoc(messageRef, {
          text: editingMessageText.trim(),
          edited: true,
          timestamp: serverTimestamp(),
        });
      } catch (error) {
        console.error("Error editing message:", error);
      } finally {
        cancelEdit();
      }
    }
  };

  const handleDeleteMessage = async () => {
    const messageIdToDelete = editingMessageId || longPressedMessageId;
    if (messageIdToDelete) {
      try {
        const messageRef = doc(db, "hellohi-messages", messageIdToDelete);
        await deleteDoc(messageRef);

        const pinnedMessage = pinnedMessages.find(
          (m) => m.messageId === messageIdToDelete
        );
        if (pinnedMessage) {
          await deleteDoc(doc(db, "hellohi-pinned-messages", pinnedMessage.id));
        }
      } catch (error) {
        console.error("Error deleting message:", error);
      } finally {
        cancelEdit();
      }
    }
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditingMessageText("");
    setLongPressedMessageId(null);
  };

  // Pin/unpin message
  const togglePinMessage = async (messageId) => {
    if (!currentUser || !receiverUid) return;

    try {
      const chatId = `${currentUser.uid}_${receiverUid}`;
      const isPinned = pinnedMessages.some((m) => m.messageId === messageId);

      if (isPinned) {
        const pinnedMessage = pinnedMessages.find(
          (m) => m.messageId === messageId
        );
        if (pinnedMessage) {
          await deleteDoc(doc(db, "hellohi-pinned-messages", pinnedMessage.id));
        }
      } else {
        const message = messages.find((m) => m.id === messageId);
        if (message) {
          await addDoc(collection(db, "hellohi-pinned-messages"), {
            chatId,
            messageId,
            messageData: message,
            pinnedBy: currentUser.uid,
            pinnedAt: serverTimestamp(),
          });
        }
      }
    } catch (error) {
      console.error("Error toggling pin:", error);
    }
  };

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-slate-900 text-gray-800 dark:text-gray-200">
        Loading Chat...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto bg-white dark:bg-slate-800 shadow-lg rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center p-3 sm:p-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
        <Link
          href="/chats"
          className="text-2xl text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-500"
        >
          <IoIosArrowRoundBack size={30} />
        </Link>
        <div className="ml-3 flex items-center gap-3 flex-grow">
          {receiverData?.profileImageUrl ? (
            <img
              src={receiverData.profileImageUrl}
              alt="User avatar"
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover border-2 border-gray-300 dark:border-slate-600"
            />
          ) : (
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gray-300 dark:bg-slate-600 flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold text-xl">
              {receiverData?.name?.[0]?.toUpperCase() || "U"}
            </div>
          )}
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-white">
              {receiverData?.name || "User"}
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400">
              {receiverData?.online ? "Online" : "Offline"}
            </p>
          </div>
        </div>

        <button
          onClick={toggleTheme}
          className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-gray-300 font-bold"
          title="Toggle theme"
        >
          {theme === "light" ? <FaMoon size={20} /> : <FaSun size={20} />}
        </button>
      </div>

      {/* Pinned messages section */}
      {pinnedMessages.length > 0 && (
        <div className="border-b border-gray-200 dark:border-slate-700 bg-blue-50 dark:bg-slate-750 p-2">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-slate-400 mb-1 px-2">
            PINNED MESSAGES
          </h3>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {pinnedMessages.map((pinned) => (
              <div
                key={pinned.id}
                className={`flex flex-col p-2 rounded-lg text-sm ${
                  pinned.messageData.sender === currentUser.uid
                    ? "bg-blue-100 dark:bg-blue-900"
                    : "bg-gray-100 dark:bg-slate-700"
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    {pinned.messageData.image && (
                      <img
                        src={pinned.messageData.image}
                        alt="pinned"
                        className="w-16 h-16 object-cover rounded mb-1"
                      />
                    )}
                    {pinned.messageData.text && (
                      <p className="whitespace-pre-wrap break-words">
                        {pinned.messageData.text}
                      </p>
                    )}
                    {pinned.messageData.audio && (
                      <button
                        onClick={() =>
                          togglePlayAudio(pinned.messageData.audio)
                        }
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium mt-1 ${
                          pinned.messageData.sender === currentUser.uid
                            ? "bg-blue-400 hover:bg-blue-300 dark:bg-blue-600 dark:hover:bg-blue-500"
                            : "bg-gray-300 hover:bg-gray-400 dark:bg-slate-600 dark:hover:bg-slate-500"
                        }`}
                      >
                        {isPlayingAudio &&
                        currentPlayingAudioUrl === pinned.messageData.audio ? (
                          <FaPauseCircle />
                        ) : (
                          <FaPlayCircle />
                        )}
                        <span>Audio</span>
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => togglePinMessage(pinned.messageData.id)}
                    className="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                    title="Unpin message"
                  >
                    <FaThumbtack size={14} />
                  </button>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {pinned.pinnedAt?.toDate
                    ? pinned.pinnedAt.toDate().toLocaleDateString()
                    : "Few seconds ago"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto w-full p-4 space-y-3 bg-white dark:bg-[#0f172a]">
        {/* Group messages by date */}
        {(() => {
          const formatDateHeader = (date) => {
            const today = new Date();
            const msgDate = new Date(
              date.getFullYear(),
              date.getMonth(),
              date.getDate()
            );
            const nowDate = new Date(
              today.getFullYear(),
              today.getMonth(),
              today.getDate()
            );
            const diffDays = Math.round(
              (nowDate - msgDate) / (1000 * 60 * 60 * 24)
            );
            if (diffDays === 0) return "Today";
            if (diffDays === 1) return "Yesterday";
            if (diffDays < 7) {
              return date.toLocaleDateString(undefined, { weekday: "long" });
            }
            return date.toLocaleDateString(undefined, {
              day: "2-digit",
              month: "2-digit",
              year: "2-digit",
            });
          };

          const grouped = {};
          messages.forEach((msg) => {
            const ts = msg.timestamp?.seconds
              ? new Date(msg.timestamp.seconds * 1000)
              : new Date();
            const key = ts.toDateString();
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(msg);
          });

          const sortedKeys = Object.keys(grouped).sort(
            (a, b) => new Date(a) - new Date(b)
          );

          return sortedKeys.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500 dark:text-slate-400">
              <p className="text-sm">
                No messages yet. Start the conversation!
              </p>
            </div>
          ) : (
            sortedKeys.map((dateKey) => (
              <div key={dateKey}>
                <div className="flex justify-center mb-2">
                  <span className="px-3 py-1 rounded-full bg-gray-200 dark:bg-slate-700 text-xs text-gray-600 dark:text-slate-300 font-medium">
                    {formatDateHeader(new Date(dateKey))}
                  </span>
                </div>
                {grouped[dateKey].map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${
                      msg.sender === currentUser.uid
                        ? "justify-end"
                        : "justify-start"
                    } mb-3 w-full`}
                  >
                    <div
                      className={`flex flex-col max-w-[90%] sm:max-w-[70%] p-3 rounded-2xl shadow-md group relative
                        ${
                          msg.sender === currentUser.uid
                            ? "bg-blue-500 text-white rounded-br-none"
                            : "bg-gray-100 dark:bg-slate-800 dark:text-slate-100 rounded-bl-none"
                        }
                      `}
                      onContextMenu={(e) =>
                        handleLongPress(e, msg.id, msg.text, msg.sender)
                      }
                    >
                      {pinnedMessages.some((m) => m.messageId === msg.id) && (
                        <div className="absolute -top-2 -right-2 text-blue-600 dark:text-blue-400">
                          <FaThumbtack size={14} />
                        </div>
                      )}

                      {msg.image && (
                        <img
                          src={msg.image}
                          alt="sent"
                          className="rounded-md mb-2 cursor-pointer max-w-full max-h-60 object-cover"
                          onClick={() => window.open(msg.image, "_blank")}
                        />
                      )}

                      {msg.audio && (
                        <button
                          onClick={() => togglePlayAudio(msg.audio)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium mb-2 ${
                            msg.sender === currentUser.uid
                              ? "bg-blue-400 hover:bg-blue-300 dark:bg-blue-600 dark:hover:bg-blue-500"
                              : "bg-gray-300 hover:bg-gray-400 dark:bg-slate-600 dark:hover:bg-slate-500"
                          }`}
                        >
                          {isPlayingAudio &&
                          currentPlayingAudioUrl === msg.audio ? (
                            <FaPauseCircle />
                          ) : (
                            <FaPlayCircle />
                          )}
                          <span>Audio</span>
                        </button>
                      )}

                      {editingMessageId === msg.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            className="flex-1 p-2.5 rounded-lg border border-gray-300 dark:border-slate-500 bg-white dark:bg-slate-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                            value={editingMessageText}
                            onChange={(e) =>
                              setEditingMessageText(e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleEditMessage();
                              if (e.key === "Escape") cancelEdit();
                            }}
                            autoFocus
                          />
                          <button
                            onClick={handleEditMessage}
                            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                          >
                            Save
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="px-3 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500 dark:bg-slate-500 dark:hover:bg-slate-400"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        msg.text && (
                          <p className="whitespace-pre-wrap break-words text-sm sm:text-base leading-relaxed">
                            {msg.text}
                          </p>
                        )
                      )}

                      <div
                        className={`text-xs mt-2 flex items-center gap-1 ${
                          msg.sender === currentUser.uid
                            ? "text-blue-100 dark:text-blue-300"
                            : "text-gray-500 dark:text-slate-400"
                        } self-end`}
                      >
                        {msg.edited && <span className="italic">(edited)</span>}
                        <span>
                          {msg.timestamp
                            ? new Date(
                                msg.timestamp.seconds * 1000
                              ).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "sending..."}
                        </span>

                        {msg.sender === currentUser.uid && (
                          <>
                            {msg.status === "sent" && (
                              <FaCheckDouble
                                className="text-gray-300 dark:text-slate-500"
                                title="Sent"
                              />
                            )}
                            {msg.status === "delivered" && (
                              <FaCheckDouble
                                className="text-blue-300 dark:text-blue-400"
                                title="Delivered"
                              />
                            )}
                            {msg.status === "seen" && (
                              <FaCheckDouble
                                className="text-green-300 dark:text-green-400"
                                title="Seen"
                              />
                            )}
                          </>
                        )}
                      </div>

                      {longPressedMessageId === msg.id && (
                        <div className="absolute -top-12 right-0 sm:left-0 sm:-top-2 flex gap-1 bg-white dark:bg-slate-700 p-2 rounded-xl shadow-lg z-10">
                          {msg.sender === currentUser.uid && (
                            <>
                              <button
                                onClick={() => {
                                  setEditingMessageId(msg.id);
                                  setEditingMessageText(msg.text || "");
                                  setLongPressedMessageId(null);
                                }}
                                className="p-2 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg"
                                title="Edit"
                              >
                                <FaEdit className="text-blue-600 dark:text-blue-400" />
                              </button>
                              <button
                                onClick={handleDeleteMessage}
                                className="p-2 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg"
                                title="Delete"
                              >
                                <FaTrashAlt className="text-red-600 dark:text-red-400" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => togglePinMessage(msg.id)}
                            className="p-2 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg"
                            title={
                              pinnedMessages.some((m) => m.messageId === msg.id)
                                ? "Unpin"
                                : "Pin"
                            }
                          >
                            <FaThumbtack
                              className={`${
                                pinnedMessages.some(
                                  (m) => m.messageId === msg.id
                                )
                                  ? "text-blue-600 dark:text-blue-400"
                                  : "text-gray-500 dark:text-gray-300"
                              }`}
                            />
                          </button>
                          <button
                            onClick={() => setLongPressedMessageId(null)}
                            className="p-2 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg"
                            title="Close"
                          >
                            <FaTimesCircle className="text-gray-500 dark:text-gray-300" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))
          );
        })()}
        <div ref={messagesEndRef} />
      </div>

      {/* Hidden audio player */}
      <audio
        ref={audioPlayerRef}
        src={currentPlayingAudioUrl || undefined}
        onEnded={handleAudioEnded}
      />

      {/* Audio recording popup */}
       {/* Audio recording popup */}
      {showAudioPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-700 p-6 rounded-xl w-80">
            <h3 className="text-lg font-semibold mb-4 dark:text-white">
              Audio Recording
            </h3>

            <div className="flex justify-center mb-4">
              {mediaBlobUrl ? (
                <button
                  onClick={() => togglePlayAudio(mediaBlobUrl)}
                  className="p-4 bg-blue-100 dark:bg-slate-600 rounded-full"
                >
                  {isPlayingAudio && currentPlayingAudioUrl === mediaBlobUrl ? (
                    <FaPauseCircle
                      size={32}
                      className="text-blue-600 dark:text-blue-400"
                    />
                  ) : (
                    <FaPlayCircle
                      size={32}
                      className="text-blue-600 dark:text-blue-400"
                    />
                  )}
                </button>
              ) : (
                <div className="p-4 bg-gray-100 dark:bg-slate-600 rounded-full">
                  <FaMicrophone
                    size={32}
                    className="text-gray-500 dark:text-gray-300"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-between mt-4">
              <button
                onClick={cancelAudioRecording}
                className="px-4 py-2 bg-gray-300 dark:bg-slate-500 text-gray-800 dark:text-white rounded-lg hover:bg-gray-400 dark:hover:bg-slate-400"
              >
                Cancel
              </button>
              <button
                onClick={handleSendAudio}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                disabled={!mediaBlobUrl}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input area */}
      {!editingMessageId && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="p-3 sm:p-4 border-t border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white flex items-end gap-2 sm:gap-3 bg-gray-50 relative"
        >
          {!imagePreview && (
            <label
              htmlFor="imageUpload"
              className="p-2.5 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-600 cursor-pointer"
              title="Attach Image"
            >
              <FaImage size={22} />
            </label>
          )}
          <input
            id="imageUpload"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageChange}
          />

          {imagePreview && (
            <div className="relative w-16 h-16 mb-1">
              <img
                src={imagePreview}
                alt="Preview"
                className="rounded-md object-cover w-full h-full shadow-sm"
              />
              <button
                type="button"
                onClick={removeImage}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow-md hover:bg-red-600"
                title="Remove Image"
              >
                <FaTimesCircle size={18} />
              </button>
            </div>
          )}

          <textarea
            rows={1}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2.5 rounded-2xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 resize-none overflow-y-auto max-h-24"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
                e.target.style.height = "auto";
              }
            }}
            disabled={recordingStatus === "recording"}
          />

          {text.trim() || image ? (
            <button
              type="submit"
              className="p-2.5 rounded-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white"
              title="Send Message"
            >
              <FaPaperPlane size={20} />
            </button>
          ) : (
            <button
              type="button"
              onClick={
                recordingStatus === "recording" ? stopRecording : startRecording
              }
              title={
                recordingStatus === "recording"
                  ? "Stop Recording"
                  : "Record Audio"
              }
              className={`p-2.5 rounded-full ${
                recordingStatus === "recording"
                  ? "bg-red-500 hover:bg-red-600 text-white animate-pulse"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-600"
              }`}
            >
              <FaMicrophone size={22} />
            </button>
          )}

          {recordingStatus === "recording" && (
            <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-3 py-1 rounded-full text-xs flex items-center">
              <div className="w-2 h-2 bg-white rounded-full mr-2 animate-pulse"></div>
              Recording...
            </div>
          )}
        </form>
      )}
    </div>
  );
};

export default ChatWithUser;

"use client";

import React, { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { auth, db, storage } from "@/lib/firebase";
import { IoIosArrowRoundBack } from "react-icons/io";
import Link from 'next/link'
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
  deleteDoc, // Added for deleting messages
} from "firebase/firestore";

import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { v4 as uuidv4 } from "uuid";
import { FaPaperPlane, FaImage, FaTimesCircle, FaMicrophone, FaPlayCircle, FaPauseCircle, FaEdit, FaTrashAlt, FaCheckDouble, FaRegTimesCircle } from "react-icons/fa"; // Added icons

const ChatWithUser = () => {
  const { uid: receiverUid } = useParams();
  const currentUser = auth.currentUser;
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const messagesEndRef = useRef(null);
  const [receiverData, setReceiverData] = useState(null);

  // Audio Recording States
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioURL, setAudioURL] = useState(null);
  const [countdown, setCountdown] = useState(30);

  // Message Editing States
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingMessageText, setEditingMessageText] = useState("");
  const [longPressedMessageId, setLongPressedMessageId] = useState(null); // State for long-pressed message

const [audioChunks, setAudioChunks] = useState([]);
const streamRef = useRef(null);
  const countdownRef = useRef(null);
  useEffect(() => {
    const fetchReceiverData = async () => {
      if (!receiverUid) return;

      const docRef = doc(db, "hellohi-users", receiverUid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        setReceiverData(docSnap.data());
      }
    };

    fetchReceiverData();
  }, [receiverUid]);


  useEffect(() => {
    if (!currentUser || !receiverUid) return;

    const messagesRef = collection(db, "hellohi-messages");
    const q = query(
      messagesRef,
      where("participants", "array-contains", currentUser.uid),
      orderBy("timestamp")
    );

    const unsub = onSnapshot(q, async (snapshot) => {
      const filtered = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter(
          (msg) =>
            (msg.sender === currentUser.uid && msg.receiver === receiverUid) ||
            (msg.sender === receiverUid && msg.receiver === currentUser.uid)
        );

      setMessages(filtered);

      // Mark messages as seen when the current user is the receiver
      filtered.forEach(async (msg) => {
        if (msg.receiver === currentUser.uid && msg.status !== "seen") {
          const messageDocRef = doc(db, "hellohi-messages", msg.id);
          await updateDoc(messageDocRef, {
            status: "seen",
          });
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
  };

  const handleSend = async (audio = null) => {
    if (!text.trim() && !image && !audio) return;

    let imageUrl = null;
    let audioUrl = null;

    if (image) {
      const imgRef = ref(storage, `chat-images/${uuidv4()}.webp`);
      const compressedImage = await compressImage(image);
      await uploadBytes(imgRef, compressedImage);
      imageUrl = await getDownloadURL(imgRef);
    }

    if (audio) {
      const audioRef = ref(storage, `chat-audios/${uuidv4()}.webm`);
      await uploadBytes(audioRef, audio);
      audioUrl = await getDownloadURL(audioRef);
    }

    await addDoc(collection(db, "hellohi-messages"), {
      text,
      image: imageUrl,
      audio: audioUrl, // Save audio URL
      sender: currentUser.uid,
      receiver: receiverUid,
      participants: [currentUser.uid, receiverUid],
      timestamp: serverTimestamp(),
      status: "sent", // Initial status for double tick
      edited: false, // For message editing
    });

    const senderRef = doc(db, "hellohi-users", currentUser.uid);
    await updateDoc(senderRef, {
      chattedWith: arrayUnion(receiverUid),
    });

    const receiverRef = doc(db, "hellohi-users", receiverUid);
    await updateDoc(receiverRef, {
      chattedWith: arrayUnion(currentUser.uid),
    });

    setText("");
    setImage(null);
    setImagePreview(null);
    setAudioBlob(null);
    setAudioURL(null);
    setShowAudioPopup(false);
  };
useEffect(() => {
    if (isRecording) {
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            stopRecording();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => clearInterval(countdownRef.current);
  }, [isRecording]);
  const compressImage = async (file) => {
    const imageBitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = imageBitmap.width;
    canvas.height = imageBitmap.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(imageBitmap, 0, 0);

    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => resolve(new File([blob], file.name.replace(/\..+$/, ".webp"), { type: "image/webp" })),
        "image/webp",
        0.7
      );
    });
  };

  // Audio Recording Functions
const startRecording = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);

  const chunks = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  recorder.onstop = () => {
    const audioBlob = new Blob(chunks, { type: "audio/webm" });
    const audioURL = URL.createObjectURL(audioBlob);
    setAudioBlob(audioBlob);
    setAudioURL(audioURL);
  };

  recorder.start();
  setAudioChunks([]);
  setMediaRecorder(recorder);
};

const stopRecording = () => {
  if (mediaRecorder) {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
    setMediaRecorder(null);
  }
};

useEffect(() => {
  if (showAudioPopup && !audioBlob) {
    startRecording();
  }
}, [showAudioPopup]);

  const cancelRecording = () => {
    stopRecording();
    setAudioBlob(null);
    setAudioURL(null);
    setShowAudioPopup(false);
  };

  const sendAudio = () => {
    if (audioBlob) {
      handleSend(audioBlob);
    }
  };

  const togglePlayAudio = (url) => {
    if (audioPlayerRef.current && audioPlayerRef.current.src === url) {
      if (isPlayingAudio) {
        audioPlayerRef.current.pause();
      } else {
        audioPlayerRef.current.play();
      }
      setIsPlayingAudio(!isPlayingAudio);
    } else {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      audioPlayerRef.current = new Audio(url);
      audioPlayerRef.current.play();
      setIsPlayingAudio(true);
      audioPlayerRef.current.onended = () => setIsPlayingAudio(false);
    }
  };

  // Message Editing/Deleting Functions
  const handleLongPress = (messageId, messageText, senderId) => {
    if (senderId === currentUser.uid) {
      setLongPressedMessageId(messageId);
      setEditingMessageText(messageText);
    }
  };

  const handleEditMessage = async () => {
    // ✅ Handle message editing
  if (editingMessageId) {
    const messageDocRef = doc(db, "hellohi-messages", editingMessageId);
    await updateDoc(messageDocRef, {
      text: text.trim(),
      edited: true,
    });
    setEditingMessageId(null);
    setText("");
    return;
  }
  };

  const handleDeleteMessage = async () => {
    if (longPressedMessageId) {
      const messageDocRef = doc(db, "hellohi-messages", longPressedMessageId);
      await deleteDoc(messageDocRef);
      setLongPressedMessageId(null); // Close context menu
    }
  };

  const handleStartEdit = (message) => {
    setEditingMessageId(message.id);
    setText(message.text); // Pre-fill the input with the message text
    setLongPressedMessageId(null); // Close context menu
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setText("");
  };

  return (
    <div className="max-w-2xl mx-auto h-screen flex flex-col bg-gray-50 dark:bg-gray-900 shadow-lg rounded-lg overflow-hidden">
      <div className="topbar bg-blue-600 text-white p-4 flex items-center gap-3">
        <Link href="/">
          <IoIosArrowRoundBack className="text-3xl font-bold cursor-pointer" />
        </Link>
        {receiverData?.profileImageUrl ? (
          <img
            src={receiverData.profileImageUrl}
            alt={receiverData.name || "User"}
            className="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-white text-blue-600 flex items-center justify-center font-bold">
            {receiverData?.name?.[0] || "U"}
          </div>
        )}
        <h2 className="text-lg font-semibold">
          {receiverData?.name || "Loading..."}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.sender === currentUser.uid ? "justify-end" : "justify-start"}`}
            onContextMenu={(e) => {
              e.preventDefault();
              handleLongPress(msg.id, msg.text, msg.sender);
            }}
          >
            <div
              className={`p-3 rounded-2xl max-w-[75%] shadow-md break-words relative ${
                msg.sender === currentUser.uid
                  ? "bg-blue-600 text-white rounded-br-none"
                  : "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 rounded-bl-none"
              }`}
            >
              {msg.image && (
                <img
                  src={msg.image}
                  alt="shared content"
                  className="w-full h-auto max-h-64 object-cover rounded-lg mb-2 cursor-pointer transition-transform duration-200 hover:scale-105"
                  loading="lazy"
                  onClick={() => window.open(msg.image, "_blank")}
                />
              )}
              {msg.audio?.length > 5 && (
  <div className="flex items-center gap-2">
    <button onClick={() => togglePlayAudio(msg.audio)} className="text-white dark:text-blue-200">
      {isPlayingAudio && audioPlayerRef.current?.src === msg.audio ? (
        <FaPauseCircle className="w-6 h-6" />
      ) : (
        <FaPlayCircle className="w-6 h-6" />
      )}
    </button>
    <audio ref={audioPlayerRef} src={msg.audio} className="hidden" />
    <span className="text-sm">Audio Message</span>
  </div>
)}

              {msg.text && <p className="text-sm">{msg.text}</p>}
              {msg.edited && (
                <span className={`text-xs mt-1 block ${msg.sender === currentUser.uid ? "text-blue-200" : "text-gray-500 dark:text-gray-400"}`}>
                  (Edited)
                </span>
              )}
              {msg.timestamp && (
                <span className={`text-xs mt-1 flex items-center gap-1 ${
                  msg.sender === currentUser.uid ? "text-blue-200" : "text-gray-500 dark:text-gray-400"
                }`}>
                  {new Date(msg.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {msg.sender === currentUser.uid && (
                    <FaCheckDouble className={msg.status === "seen" ? "text-blue-400" : "text-gray-300"} />
                  )}
                </span>
              )}

              {longPressedMessageId === msg.id && msg.sender === currentUser.uid && (
                <div className="absolute top-0 right-0 mt-2 mr-2 bg-white dark:bg-gray-700 rounded-md shadow-lg py-1 z-10">
                  <button
                    onClick={() => handleStartEdit(msg)}
                    className="flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 w-full text-left"
                  >
                    <FaEdit className="mr-2" /> Edit
                  </button>
                  <button
                    onClick={handleDeleteMessage}
                    className="flex items-center px-4 py-2 text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-600 w-full text-left"
                  >
                    <FaTrashAlt className="mr-2" /> Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-col gap-2 bg-white dark:bg-gray-800">
        {imagePreview && (
          <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
            <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
            <button
              onClick={removeImage}
              className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 text-xs hover:bg-red-600 transition-colors"
              aria-label="Remove image"
            >
              <FaTimesCircle />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          {editingMessageId && (
            <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-2 w-full mb-2">
              <span className="text-sm text-gray-600 dark:text-gray-300 mr-2">Editing:</span>
              <span className="text-sm italic flex-1 truncate">{messages.find(msg => msg.id === editingMessageId)?.text}</span>
              <button onClick={handleCancelEdit} className="text-red-500 hover:text-red-600 ml-2">
                <FaRegTimesCircle />
              </button>
            </div>
          )}
          <input
          
            type="text"
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 rounded-full border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (editingMessageId ? handleEditMessage() : handleSend())}
          />
          <label className="cursor-pointer text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors">
            <FaImage className="w-7 h-7" />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageChange}
            />
          </label>

          <button
            onClick={startRecording}
            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors p-2 rounded-full"
            aria-label="Record audio"
          >
            <FaMicrophone className="w-6 h-6" />
          </button>

          <button
            onClick={editingMessageId ? handleEditMessage : handleSend}
            className="bg-blue-600 text-white p-3 rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!text.trim() && !image && !editingMessageId}
            aria-label={editingMessageId ? "Edit message" : "Send message"}
          >
            {editingMessageId ? <FaEdit className="w-5 h-5" /> : <FaPaperPlane className="w-5 h-5" />}
          </button>
        </div>
      </div>

     {showAudioPopup && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
    <div className="bg-white dark:bg-gray-900 p-6 rounded-xl w-full max-w-sm shadow-lg text-center space-y-4">
      {!audioBlob ? (
        <>
          <p className="text-lg font-semibold">Recording...</p>
          <button
            onClick={stopRecording}
            className="bg-red-500 text-white px-4 py-2 rounded-xl shadow"
          >
            Stop Recording
          </button>
        </>
      ) : (
        <>
          <audio controls src={audioURL} className="w-full" />
          <div className="flex justify-between gap-4 mt-4">
            <button
              onClick={() => {
                handleSend(audioBlob);
                setAudioBlob(null);
                setAudioURL(null);
                setShowAudioPopup(false);
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl flex-1"
            >
              Send
            </button>
            <button
              onClick={() => {
                setAudioBlob(null);
                setAudioURL(null);
                setShowAudioPopup(false);
              }}
              className="bg-gray-300 dark:bg-gray-700 text-black dark:text-white px-4 py-2 rounded-xl flex-1"
            >
              Discard
            </button>
          </div>
        </>
      )}
    </div>
  </div>
)}

    </div>
  );
};

export default ChatWithUser;

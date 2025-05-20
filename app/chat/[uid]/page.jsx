"use client";

import React, { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { auth, db, storage } from "@/lib/firebase"; // Assuming firebase is configured
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
  FaSun, // For theme toggle
  FaMoon, // For theme toggle
} from "react-icons/fa";

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
  const [showAudioPopup, setShowAudioPopup] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioPlayerRef = useRef(null);
  const [currentPlayingAudioUrl, setCurrentPlayingAudioUrl] = useState(null);


  // Message Editing States
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingMessageText, setEditingMessageText] = useState("");
  const [longPressedMessageId, setLongPressedMessageId] = useState(null);

  // const [audioChunks, setAudioChunks] = useState([]); // Not directly used, can be removed if recorder.ondataavailable handles chunks locally
  const countdownRef = useRef(null);

  // Theme State
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    // Check local storage for saved theme
    const savedTheme = localStorage.getItem("chatTheme");
    if (savedTheme) {
      setTheme(savedTheme);
    } else if (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      setTheme("dark"); // Prefer system theme if no preference saved
    }
  }, []);

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
    // Also clear the file input if you want to allow re-selecting the same file after removing
    const fileInput = document.getElementById("imageUpload");
    if (fileInput) {
      fileInput.value = "";
    }
  };

  const compressImage = async (file) => {
    // Consider adding a check for HEIC/HEIF if needed and converting to JPEG first
    // For simplicity, keeping the original WEBP conversion
    try {
      const imageBitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      
      // Optional: Resize for very large images to save storage and bandwidth
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
              console.error("Canvas toBlob failed, returning original file");
              resolve(file); // Fallback to original file if compression fails
            }
          },
          "image/webp",
          0.7 // Quality
        );
      });
    } catch (error) {
        console.error("Image compression error:", error);
        return file; // Fallback to original file
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
        status: "sent", // Initial status
        edited: false,
      });

      // Update `chattedWith` for both users
      const senderRef = doc(db, "hellohi-users", currentUser.uid);
      await updateDoc(senderRef, { chattedWith: arrayUnion(receiverUid) });
      const receiverRef = doc(db, "hellohi-users", receiverUid);
      await updateDoc(receiverRef, { chattedWith: arrayUnion(currentUser.uid) });

      setText("");
      setImage(null);
      setImagePreview(null);
      removeImage(); // Clear file input
      setAudioBlob(null);
      setAudioURL(null);
      setShowAudioPopup(false);
    } catch (error) {
      console.error("Error sending message:", error);
      // Add user feedback for error
    }
  };

  useEffect(() => {
    let intervalId;
    if (isRecording && countdown > 0) {
      intervalId = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    } else if (countdown === 0 && isRecording) {
      stopRecording();
    }
    countdownRef.current = intervalId; // Store intervalId in ref
    return () => clearInterval(intervalId);
  }, [isRecording, countdown]);


  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' }); // Specify MIME type for better compatibility
      const chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const completeBlob = new Blob(chunks, { type: "audio/webm" });
        const url = URL.createObjectURL(completeBlob);
        setAudioBlob(completeBlob);
        setAudioURL(url);
        // Do not automatically stop stream tracks here if you want to re-record without asking permission again soon
      };

      recorder.start();
      setIsRecording(true);
      // setAudioChunks([]); // Chunks are local to this function
      setMediaRecorder(recorder);
      setCountdown(30); // Reset countdown
      setAudioBlob(null); // Clear previous recording
      setAudioURL(null);
    } catch (error) {
      console.error("Error starting recording:", error);
      alert("Could not start recording. Please ensure microphone permission is granted.");
      setShowAudioPopup(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      // It's good practice to stop tracks when done to release resources
      mediaRecorder.stream.getTracks().forEach((track) => track.stop());
      setMediaRecorder(null); // Important to allow new MediaRecorder instance next time
      setIsRecording(false);
      // Countdown is reset when starting
    }
    if(countdownRef.current) clearInterval(countdownRef.current);
  };
  
  // Automatically start recording when popup opens and no audio is yet recorded
   useEffect(() => {
    if (showAudioPopup && !isRecording && !audioBlob) {
      startRecording();
    }
  }, [showAudioPopup, isRecording, audioBlob]);


  const cancelRecording = () => {
    stopRecording(); // This will also stop tracks
    setAudioBlob(null);
    setAudioURL(null);
    setShowAudioPopup(false);
    setCountdown(30); // Reset countdown
  };

  const sendAudio = () => {
    if (audioBlob) {
      handleSend(audioBlob);
      // State clearing is handled in handleSend
    }
  };

  const togglePlayAudio = (url) => {
    if (audioPlayerRef.current && currentPlayingAudioUrl === url && !audioPlayerRef.current.paused) {
      audioPlayerRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      if (audioPlayerRef.current && !audioPlayerRef.current.paused) {
        audioPlayerRef.current.pause(); // Pause previous audio
      }
      audioPlayerRef.current = new Audio(url);
      audioPlayerRef.current.play().catch(error => console.error("Error playing audio:", error));
      setCurrentPlayingAudioUrl(url);
      setIsPlayingAudio(true);
      audioPlayerRef.current.onended = () => {
        setIsPlayingAudio(false);
        setCurrentPlayingAudioUrl(null);
      };
       audioPlayerRef.current.onpause = () => { // Handle explicit pause
        if (audioPlayerRef.current && audioPlayerRef.current.src === url) {
            setIsPlayingAudio(false);
        }
      };
    }
  };

  const handleLongPress = (e, messageId, messageText, senderId) => {
     e.preventDefault(); // Prevent context menu
    if (senderId === currentUser?.uid) { // Only allow sender to edit/delete
      setLongPressedMessageId(messageId);
      setEditingMessageText(messageText || ""); // Ensure text is not undefined
    }
  };

  const handleEditMessage = async () => {
    if (editingMessageId && editingMessageText.trim()) {
      try {
        const messageRef = doc(db, "hellohi-messages", editingMessageId);
        await updateDoc(messageRef, {
          text: editingMessageText.trim(),
          edited: true,
          timestamp: serverTimestamp(), // Optionally update timestamp on edit
        });
      } catch (error) {
        console.error("Error editing message:", error);
      } finally {
        cancelEdit();
      }
    }
  };

  const handleDeleteMessage = async () => {
    // Use longPressedMessageId if editingMessageId is not yet set by edit button
    const messageIdToDelete = editingMessageId || longPressedMessageId;
    if (messageIdToDelete) {
      try {
        const messageRef = doc(db, "hellohi-messages", messageIdToDelete);
        // Optional: Before deleting, check if the current user is the sender if not already done
        await deleteDoc(messageRef);
      } catch (error) {
        console.error("Error deleting message:", error);
      } finally {
        cancelEdit(); // Resets all editing states
      }
    }
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditingMessageText("");
    setLongPressedMessageId(null);
  };
  
  if (!currentUser) {
    // Or a redirect to login
    return <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-slate-900 text-gray-800 dark:text-gray-200">Loading user...</div>;
  }


  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto bg-white dark:bg-slate-800 shadow-lg rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center p-3 sm:p-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-750">
        <Link href="/chats" className="text-2xl text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-500">
          <IoIosArrowRoundBack size={30} />
        </Link>
        <div className="ml-3 flex items-center gap-3 flex-grow">
          {receiverData?.photoURL ? (
            <img
              src={receiverData.photoURL}
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
              {receiverData?.online ? "Online" : "Offline"} {/* Consider real-time status updates */}
            </p>
          </div>
        </div>
        <button
          onClick={toggleTheme}
          className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-gray-300"
          title="Toggle theme"
        >
          {theme === "light" ? <FaMoon size={20} /> : <FaSun size={20} />}
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-100 dark:bg-slate-900">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col max-w-[80%] sm:max-w-[70%] p-2.5 rounded-lg shadow ${
              msg.sender === currentUser.uid
                ? "bg-blue-500 text-white self-end rounded-br-none"
                : "bg-gray-200 dark:bg-slate-700 dark:text-slate-100 self-start rounded-bl-none"
            } relative group`}
            onContextMenu={(e) => handleLongPress(e, msg.id, msg.text, msg.sender)}
          >
            {msg.image && (
              <img
                src={msg.image}
                alt="sent image"
                className="rounded-md mb-1.5 cursor-pointer max-w-full max-h-60 object-cover"
                onClick={() => window.open(msg.image, "_blank")}
              />
            )}

            {msg.audio && (
              <button
                onClick={() => togglePlayAudio(msg.audio)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer mb-1
                  ${msg.sender === currentUser.uid 
                    ? 'bg-blue-400 hover:bg-blue-300 dark:bg-blue-500 dark:hover:bg-blue-400' 
                    : 'bg-gray-300 hover:bg-gray-400 dark:bg-slate-600 dark:hover:bg-slate-500'}`}
              >
                {isPlayingAudio && currentPlayingAudioUrl === msg.audio ? <FaPauseCircle /> : <FaPlayCircle />}
                <span className="text-sm">Audio</span>
              </button>
            )}

            {msg.text && <p className="whitespace-pre-wrap break-words text-sm sm:text-base">{msg.text}</p>}
            
            <div className={`text-xs mt-1 flex items-center gap-1 ${msg.sender === currentUser.uid ? 'text-blue-100 dark:text-blue-300' : 'text-gray-500 dark:text-slate-400'} self-end`}>
              {msg.edited && (
                <span className="italic text-xs">(edited)</span>
              )}
              <span>
                {msg.timestamp
                  ? new Date(msg.timestamp.seconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  : "sending..."}
              </span>
              {msg.sender === currentUser.uid && (
                <>
                  {msg.status === "sent" && <FaCheckDouble className="text-gray-400 dark:text-slate-500" title="Sent"/>}
                  {msg.status === "delivered" && <FaCheckDouble className="text-blue-300 dark:text-sky-300" title="Delivered"/>} {/* A lighter blue for delivered on dark might be needed */}
                  {msg.status === "seen" && <FaCheckDouble className="text-green-300 dark:text-green-400" title="Seen"/>}
                </>
              )}
            </div>
             {/* Edit/Delete options for sender, shown on long press (context menu) */}
            {longPressedMessageId === msg.id && msg.sender === currentUser.uid && (
                <div className="absolute -top-10 right-0 sm:left-0 sm:-top-2 sm:group-hover:flex flex gap-1 bg-white dark:bg-slate-600 p-1 rounded-md shadow-lg z-10">
                    <button onClick={() => { setEditingMessageId(msg.id); setLongPressedMessageId(null); }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-500 rounded">
                        <FaEdit className="text-blue-600 dark:text-blue-400" />
                    </button>
                    <button onClick={handleDeleteMessage} className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-500 rounded">
                        <FaTrashAlt className="text-red-600 dark:text-red-400" />
                    </button>
                     <button onClick={() => setLongPressedMessageId(null)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-500 rounded">
                        <FaTimesCircle className="text-gray-500 dark:text-gray-300" />
                    </button>
                </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Message Editing Input - appears when editingMessageId is set */}
      {editingMessageId && (
        <div className="p-3 bg-gray-100 dark:bg-slate-700 border-t border-gray-300 dark:border-slate-600 flex items-center gap-2">
          <input
            type="text"
            className="flex-1 p-2.5 rounded-lg border border-gray-300 dark:border-slate-500 bg-white dark:bg-slate-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
            value={editingMessageText}
            onChange={(e) => setEditingMessageText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleEditMessage(); if (e.key === "Escape") cancelEdit(); }}
            autoFocus
          />
          <button
            onClick={handleEditMessage}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            Save
          </button>
          <button
            onClick={cancelEdit}
            className="px-4 py-2.5 bg-gray-400 text-white rounded-lg hover:bg-gray-500 dark:bg-slate-500 dark:hover:bg-slate-400"
          >
            Cancel
          </button>
        </div>
      )}


      {/* Audio recording popup */}
      {showAudioPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex justify-center items-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-sm flex flex-col items-center space-y-5 shadow-xl">
            <p className="text-lg font-semibold text-gray-800 dark:text-slate-100">
              {isRecording ? "Recording Audio..." : (audioBlob ? "Review Audio" : "Ready to Record")}
            </p>
            <p className={`text-3xl font-mono ${isRecording && countdown <=10 ? 'text-red-500' : 'text-gray-700 dark:text-slate-200'}`}>
                {Math.floor(countdown / 60).toString().padStart(2, '0')}:{(countdown % 60).toString().padStart(2, '0')}
            </p>

            {audioURL && !isRecording && (
              <audio controls src={audioURL} className="w-full rounded-lg my-2 h-10" />
            )}
            
            <div className="flex gap-3 justify-center w-full">
             {!audioBlob ? ( // Show record/stop controls
                isRecording ? (
                    <button
                    onClick={stopRecording}
                    className="px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium w-full"
                    >
                    Stop
                    </button>
                ) : (
                    <button // This button might not be needed if auto-start is reliable
                    onClick={startRecording}
                    className="px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium w-full"
                    >
                    Record
                    </button>
                )
             ) : ( // Show Send/Re-record controls
                <>
                    <button
                        onClick={sendAudio}
                        className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex-1"
                    > Send </button>
                    <button
                        onClick={startRecording} // This will act as re-record
                        className="px-5 py-2.5 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 text-sm font-medium flex-1"
                    > Re-record </button>
                </>
             )}
            </div>
             <button
                onClick={cancelRecording}
                className="mt-2 px-5 py-2.5 bg-gray-300 text-gray-700 dark:bg-slate-600 dark:text-slate-200 rounded-lg hover:bg-gray-400 dark:hover:bg-slate-500 text-sm font-medium w-full"
            >
                Cancel
            </button>
          </div>
        </div>
      )}

      {/* Input area - hidden when editing a message */}
      {!editingMessageId && (
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="p-3 sm:p-4 border-t border-gray-200 dark:border-slate-700 flex items-end gap-2 sm:gap-3 bg-gray-50 dark:bg-slate-750"
        >
          {/* Image upload */}
          {!imagePreview && ( // Only show icon if no image is selected
            <label
              htmlFor="imageUpload"
              className="p-2.5 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-600 cursor-pointer"
              title="Attach Image"
            >
              <FaImage size={22} />
            </label>
          )}
          <input id="imageUpload" type="file" accept="image/*" className="hidden" onChange={handleImageChange} />

          {/* Preview image with remove */}
          {imagePreview && (
            <div className="relative w-16 h-16 mb-1">
              <img src={imagePreview} alt="Preview" className="rounded-md object-cover w-full h-full shadow-sm" />
              <button
                type="button"
                onClick={removeImage}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow-md hover:bg-red-600"
                title="Remove Image"
              >
                <FaTimesCircle size={18}/>
              </button>
            </div>
          )}

          {/* Message input */}
          <textarea
            rows={1}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2.5 rounded-2xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 resize-none overflow-y-auto max-h-24"
            value={text}
            onChange={(e) => {
                setText(e.target.value);
                // Auto-resize textarea
                e.target.style.height = 'auto';
                e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                    // Reset height after send
                    e.target.style.height = 'auto';

                }
            }}
            disabled={showAudioPopup}
          />

          {/* Audio record / Send button */}
          {text.trim() || image ? (
            <button
              type="submit"
              disabled={showAudioPopup || (!text.trim() && !image)}
              className={`p-2.5 rounded-full text-white ${
                (text.trim() || image) && !showAudioPopup
                  ? "bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                  : "bg-gray-400 dark:bg-slate-500 cursor-not-allowed"
              }`}
              title="Send Message"
            >
              <FaPaperPlane size={20} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (editingMessageId) return; // Don't show audio popup if editing
                setShowAudioPopup(true);
              }}
              title="Record Audio"
              className="p-2.5 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-600"
              disabled={showAudioPopup || editingMessageId} // Disable if editing
            >
              <FaMicrophone size={22} />
            </button>
          )}
        </form>
      )}
    </div>
  );
};

export default ChatWithUser;

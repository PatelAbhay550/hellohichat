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

  // Message Editing States
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingMessageText, setEditingMessageText] = useState("");
  const [longPressedMessageId, setLongPressedMessageId] = useState(null);

  const [audioChunks, setAudioChunks] = useState([]);
  const countdownRef = useRef(null);

  // Fetch receiver data
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

  // Compress image function as in your code
  const compressImage = async (file) => {
    const imageBitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = imageBitmap.width;
    canvas.height = imageBitmap.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(imageBitmap, 0, 0);

    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) =>
          resolve(
            new File([blob], file.name.replace(/\..+$/, ".webp"), {
              type: "image/webp",
            })
          ),
        "image/webp",
        0.7
      );
    });
  };

  // Send message handler
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
      audio: audioUrl,
      sender: currentUser.uid,
      receiver: receiverUid,
      participants: [currentUser.uid, receiverUid],
      timestamp: serverTimestamp(),
      status: "sent",
      edited: false,
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

  // Audio recording control

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
    setIsRecording(true);
    setAudioChunks([]);
    setMediaRecorder(recorder);
    setCountdown(30);
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach((track) => track.stop());
      setMediaRecorder(null);
      setIsRecording(false);
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

  // Editing / Deleting messages (only sender)

  const handleLongPress = (messageId, messageText, senderId) => {
    if (senderId === currentUser.uid) {
      setLongPressedMessageId(messageId);
      setEditingMessageText(messageText);
    }
  };

  const handleEditMessage = async () => {
    if (editingMessageId) {
      const messageRef = doc(db, "hellohi-messages", editingMessageId);
      await updateDoc(messageRef, {
        text: editingMessageText,
        edited: true,
      });
      setEditingMessageId(null);
      setEditingMessageText("");
      setLongPressedMessageId(null);
    }
  };

  const handleDeleteMessage = async () => {
    if (editingMessageId) {
      const messageRef = doc(db, "hellohi-messages", editingMessageId);
      await deleteDoc(messageRef);
      setEditingMessageId(null);
      setEditingMessageText("");
      setLongPressedMessageId(null);
    }
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditingMessageText("");
    setLongPressedMessageId(null);
  };

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto bg-white shadow-md rounded-md">
      {/* Header */}
      <div className="flex items-center p-4 border-b border-gray-200">
        <Link href="/chats" className="text-2xl text-blue-600">
          <IoIosArrowRoundBack />
        </Link>
        <div className="ml-4 flex items-center gap-3">
          {receiverData?.photoURL ? (
            <img
              src={receiverData.photoURL}
              alt="User avatar"
              className="w-12 h-12 rounded-full object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 font-bold">
              {receiverData?.name?.[0] || "U"}
            </div>
          )}
          <div>
            <h2 className="text-lg font-semibold">
              {receiverData?.name || "User"}
            </h2>
            <p className="text-sm text-gray-500">
              {receiverData?.online ? "Online" : "Offline"}
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col max-w-xs p-2 rounded-md ${
              msg.sender === currentUser.uid
                ? "bg-blue-100 self-end"
                : "bg-white self-start"
            } relative`}
            onContextMenu={(e) => {
              e.preventDefault();
              handleLongPress(msg.id, msg.text || "", msg.sender);
            }}
          >
            {msg.image && (
              <img
                src={msg.image}
                alt="sent image"
                className="rounded-md mb-1 cursor-pointer max-w-full max-h-48 object-cover"
                onClick={() => window.open(msg.image, "_blank")}
              />
            )}

            {msg.audio && (
              <button
                onClick={() => togglePlayAudio(msg.audio)}
                className="flex items-center gap-2 bg-gray-200 px-3 py-1 rounded-md cursor-pointer"
              >
                {isPlayingAudio ? <FaPauseCircle /> : <FaPlayCircle />}
                <span>Audio message</span>
              </button>
            )}

            <p className="whitespace-pre-wrap">{msg.text}</p>
            {msg.edited && (
              <span className="text-xs italic text-gray-500"> (edited)</span>
            )}
            <div className="absolute bottom-1 right-2 text-xs text-gray-400 flex items-center gap-1">
              {msg.sender === currentUser.uid && (
                <>
                  {msg.status === "sent" && (
                    <FaCheckDouble className="text-gray-400" />
                  )}
                  {msg.status === "delivered" && (
                    <FaCheckDouble className="text-blue-600" />
                  )}
                  {msg.status === "seen" && (
                    <FaCheckDouble className="text-green-500" />
                  )}
                </>
              )}
              <span>
                {msg.timestamp
                  ? new Date(msg.timestamp.seconds * 1000).toLocaleTimeString(
                      [],
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                      }
                    )
                  : ""}
              </span>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Editing overlay */}
      {longPressedMessageId && (
        <div className="absolute bottom-24 left-0 right-0 flex justify-center gap-4 bg-white p-3 border-t border-gray-300 shadow-lg z-50">
          <button
            onClick={() => {
              setEditingMessageId(longPressedMessageId);
              setLongPressedMessageId(null);
            }}
            className="flex items-center gap-1 text-blue-600 hover:underline"
          >
            <FaEdit /> Edit
          </button>
          <button
            onClick={() => {
              setEditingMessageId(longPressedMessageId);
              setLongPressedMessageId(null);
              handleDeleteMessage();
            }}
            className="flex items-center gap-1 text-red-600 hover:underline"
          >
            <FaTrashAlt /> Delete
          </button>
          <button
            onClick={() => setLongPressedMessageId(null)}
            className="flex items-center gap-1 text-gray-600 hover:underline"
          >
            <FaTimesCircle /> Cancel
          </button>
        </div>
      )}

      {/* Edit message input */}
      {editingMessageId && (
        <div className="p-4 bg-gray-100 border-t border-gray-300 flex items-center gap-2">
          <input
            type="text"
            className="flex-1 p-2 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={editingMessageText}
            onChange={(e) => setEditingMessageText(e.target.value)}
          />
          <button
            onClick={handleEditMessage}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Save
          </button>
          <button
            onClick={cancelEdit}
            className="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Audio recording popup */}
      {showAudioPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-50">
          <div className="bg-white rounded-lg p-6 w-80 flex flex-col items-center space-y-4 shadow-lg">
            <p className="text-lg font-semibold">Recording Audio Message</p>
            <p className="text-2xl font-mono">{countdown}s</p>

            <div className="flex gap-4">
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Start
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Stop
                </button>
              )}
              <button
                onClick={cancelRecording}
                className="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500"
              >
                Cancel
              </button>
              {audioBlob && (
                <button
                  onClick={sendAudio}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Send
                </button>
              )}
            </div>

            {audioURL && (
              <audio controls src={audioURL} className="w-full rounded" />
            )}
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
          className="p-4 border-t border-gray-300 flex items-center gap-3 bg-white"
        >
          {/* Image upload */}
          <label
            htmlFor="imageUpload"
            className="cursor-pointer text-gray-500 hover:text-blue-600"
            title="Attach Image"
          >
            <FaImage size={22} />
          </label>
          <input
            id="imageUpload"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageChange}
          />

          {/* Preview image with remove */}
          {imagePreview && (
            <div className="relative w-16 h-16">
              <img
                src={imagePreview}
                alt="Preview"
                className="rounded-md object-cover w-full h-full"
              />
              <button
                type="button"
                onClick={removeImage}
                className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1"
                title="Remove Image"
              >
                <FaTimesCircle />
              </button>
            </div>
          )}

          {/* Message input */}
          <input
            type="text"
            placeholder="Type a message"
            className="flex-1 px-4 py-2 rounded-full border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={showAudioPopup}
          />

          {/* Audio record button */}
          <button
            type="button"
            onClick={() => setShowAudioPopup(true)}
            title="Record Audio"
            className="text-gray-500 hover:text-blue-600"
            disabled={showAudioPopup}
          >
            <FaMicrophone size={22} />
          </button>

          {/* Send button */}
          <button
            type="submit"
            disabled={!text.trim() && !image}
            className={`p-2 rounded-full text-white ${
              text.trim() || image
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-gray-400 cursor-not-allowed"
            }`}
            title="Send Message"
          >
            <FaPaperPlane />
          </button>
        </form>
      )}
    </div>
  );
};

export default ChatWithUser;

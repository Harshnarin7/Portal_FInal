import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBjU8Jbbv4QIsgO2LYgWXVcsDBqC663xVU",
  authDomain: "portal-trial.firebaseapp.com",
  projectId: "portal-trial",
  storageBucket: "portal-trial.firebasestorage.app",
  messagingSenderId: "41967040411",
  appId: "1:41967040411:web:05c28da23e4136b43d533e",
  measurementId: "G-Z9JPX6E6CL"
};


const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
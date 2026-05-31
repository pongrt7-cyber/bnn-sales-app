import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyA3hKw1pqBD-X1hkVChChOlYQ1k1n6rf0M",
  authDomain: "bnn-sales.firebaseapp.com",
  databaseURL: "https://bnn-sales-default-rtdb.firebaseio.com",
  projectId: "bnn-sales",
  storageBucket: "bnn-sales.firebasestorage.app",
  messagingSenderId: "648923859695",
  appId: "1:648923859695:web:b0709709510d2f8a91291a"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
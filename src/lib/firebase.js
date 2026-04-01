import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyAxEZva5XEU8ZpE_5QVtK9Ab8F97ooaMHY",
  authDomain: "workflow-be.firebaseapp.com",
  projectId: "workflow-be",
  storageBucket: "workflow-be.firebasestorage.app",
  messagingSenderId: "83045507480",
  appId: "1:83045507480:web:74d72a438b023b022c4bed",
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)
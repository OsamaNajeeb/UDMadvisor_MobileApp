import React, { useState, useRef } from 'react';
import { View, StyleSheet, FlatList, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { Text, Appbar, TextInput, IconButton, Avatar, ActivityIndicator } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


const API_BASE_URL = "https://scraper2-nzef.onrender.com";

export default function Chatbot() {

  const router = useRouter();
  const insets = useSafeAreaInsets(); 
  const flatListRef = useRef(null); // Used to auto-scroll to the bottom

  // --- STATE ---
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  // We start with one greeting message from the bot
  const [messages, setMessages] = useState([
    {
      id: '1',
      text: "Hello! I am your UDM Advisor Assistant. How can I help you plan your schedule today?",
      sender: 'bot',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

// --- DIRECT HUGGING FACE AI INTEGRATION (BULLETPROOF) ---
  const HF_TOKEN = process.env.EXPO_PUBLIC_HF_TOKEN;
  const HF_API_URL = "https://router.huggingface.co/v1/chat/completions";

// --- GUARDRAIL 1: COMPETITOR DETECTION (Input Guard) ---
  const checkInputGuardrails = (text) => {
    const forbiddenKeywords = ["wayne state", "oakland university", "michigan state", "msu"];
    const lowerText = text.toLowerCase();

    for (let word of forbiddenKeywords) {
      if (lowerText.includes(word)) {
        return {
          passed: false,
          fixMessage: `As a University of Detroit Mercy advisor, I cannot provide information about ${word}. Let's focus on your UDM schedule!`
        };
      }
    }
    return { passed: true };
  };

  // --- GUARDRAIL 2: HALLUCINATION DETECTION (Output Guard) ---
  // Scans the AI's response for fake links or non-UDM emails
  const checkOutputGuardrails = (aiResponseText) => {
    // Regex to find anything that looks like a URL or Email
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/g;

    const foundUrls = aiResponseText.match(urlRegex) || [];
    const foundEmails = aiResponseText.match(emailRegex) || [];

    // 1. Did the AI hallucinate a link that isn't UDM?
    for (let url of foundUrls) {
      if (!url.toLowerCase().includes("udmercy.edu")) {
        return {
          passed: false,
          fixMessage: `I have some advice on that, but to be safe, please verify your specific requirements on the official UDM website at www.udmercy.edu.`
        };
      }
    }

    // 2. Did the AI hallucinate a weird email address?
    for (let email of foundEmails) {
      if (!email.toLowerCase().includes("@udmercy.edu")) {
        return {
          passed: false,
          fixMessage: `For the most accurate information on that topic, please reach out to your faculty advisor using your official @udmercy.edu email address.`
        };
      }
    }

    return { passed: true };
  };

  // --- GUARDRAIL 3: PII DETECTION (Input Guard) ---
  // Mimics Microsoft Presidio to prevent sensitive data leaks
  const checkPiiGuardrails = (text) => {
    // Looks for standard US phone numbers (e.g., 555-123-4567, 5551234567)
    const phoneRegex = /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/;
    
    // Looks for 9-digit SSNs or typical 8-to-9 digit Student IDs
    const idRegex = /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b|\b\d{8,9}\b/;

    if (phoneRegex.test(text) || idRegex.test(text)) {
      return {
        passed: false,
        fixMessage: `For your protection, I cannot process messages containing personal information like phone numbers, Student IDs, or SSNs. Please remove it and ask your scheduling question again!`
      };
    }
    return { passed: true };
  };

  const sendMessage = async () => {
    if (inputText.trim() === '') return;

    const userText = inputText.trim();

    // 1. Create the user's message
    const newUserMessage = {
      id: Date.now().toString(),
      text: userText,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    // 2. Add user message to screen and clear input box
    setMessages(prev => [...prev, newUserMessage]);
    setInputText('');
    Keyboard.dismiss(); 
    
    // 3. Show "Bot is typing..." indicator
    setIsTyping(true);

    // --- 🚨 THE INTERCEPTOR: RUN INPUT GUARDRAILS 🚨 ---
    const guardResult = checkInputGuardrails(userText);
    
    if (!guardResult.passed) {
      setTimeout(() => {
        const guardMessage = {
          id: (Date.now() + 1).toString(),
          text: guardResult.fixMessage,
          sender: 'bot',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, guardMessage]);
        setIsTyping(false);
      }, 600); 
      
      // CRITICAL: This 'return' stops the code from reaching Hugging Face!
      return; 
    }
    // ----------------------------------------------------

    // --- 🚨 THE INTERCEPTOR: RUN PII GUARDRAILS 🚨 ---
    const piiResult = checkPiiGuardrails(userText);
    
    if (!piiResult.passed) {
      setTimeout(() => {
        const piiMessage = {
          id: (Date.now() + 1).toString(),
          text: piiResult.fixMessage,
          sender: 'bot',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, piiMessage]);
        setIsTyping(false);
      }, 600); 
      
      // CRITICAL: Stop the code from sending sensitive data to the AI!
      return; 
    }
    // ----------------------------------------------------

    try {
      // 4. Talk directly to the ungated Qwen AI model
      const response = await fetch(HF_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HF_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: "Qwen/Qwen2.5-72B-Instruct", 
          messages: [
            { 
              role: "system", 
              content: "You are an academic advisor assistant for University of Detroit Mercy. Keep answers concise, friendly, and helpful. Do not use formatting like bolding or italics. STRICT RESTRICTION: You must ONLY answer questions related to university academics, scheduling, courses, campus life, and student resources. If a user asks about politics, vehicles, general world facts, or any off-topic subject, you must politely refuse to answer and steer the conversation back to UDM academics." 
            },
            { role: "user", content: userText }
          ],
          max_tokens: 150 
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Hugging Face Error:", errorText);
        throw new Error("Failed to reach AI");
      }

      const data = await response.json();
      let finalBotText = data.choices[0].message.content.trim();

      // --- 🚨 THE INTERCEPTOR: RUN OUTPUT GUARDRAILS 🚨 ---
      const outputGuardResult = checkOutputGuardrails(finalBotText);
      
      if (!outputGuardResult.passed) {
        // If it hallucinates a bad link, override the AI's text with the safe fix!
        finalBotText = outputGuardResult.fixMessage;
      }
      // -----------------------------------------------------

      // 5. Build the real AI's response bubble
      const newBotMessage = {
        id: (Date.now() + 1).toString(),
        text: finalBotText,
        sender: 'bot',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, newBotMessage]);

    } catch (error) {
      console.error("Chat Error:", error);
      
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        text: "⚠️ Connection Error: Could not reach Hugging Face.",
        sender: 'bot',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } finally {
      setIsTyping(false);
    }
  };
  

  
  // --- UI RENDERER FOR EACH BUBBLE ---
  const renderMessage = ({ item }) => {
    const isUser = item.sender === 'user';

    return (
      <View style={[styles.messageRow, isUser ? styles.userRow : styles.botRow]}>
        
        {/* Bot Avatar */}
        {!isUser && (
          <Avatar.Icon size={36} icon="robot" style={styles.botAvatar} color="#fff" />
        )}

        {/* Message Bubble */}
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.botBubble]}>
          <Text style={[styles.messageText, isUser ? styles.userText : styles.botText]}>
            {item.text}
          </Text>
          <Text style={[styles.timestamp, isUser ? styles.userTimestamp : styles.botTimestamp]}>
            {item.timestamp}
          </Text>
        </View>

      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <Appbar.Header style={{ backgroundColor: '#A5093E' }}>
        <Appbar.BackAction onPress={() => router.back()} color="#fff" />
        <Appbar.Content title="Advisor AI" color="#fff" />
      </Appbar.Header>

      {/* KEYBOARD AVOIDING VIEW: 
        This is the magic wrapper that prevents the keyboard from covering the chat box!
      */}
      <KeyboardAvoidingView 
        style={styles.chatArea} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        
        {/* CHAT MESSAGES LIST */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.listContent}
          // Automatically scroll to the bottom when a new message appears!
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />

        {/* TYPING INDICATOR */}
        {isTyping && (
          <View style={styles.typingIndicatorContainer}>
            <ActivityIndicator size="small" color="#A5093E" />
            <Text style={{ marginLeft: 8, color: '#666', fontStyle: 'italic' }}>Advisor is typing...</Text>
          </View>
        )}

        {/* INPUT BAR */}
        <View style={[styles.inputContainer, { paddingBottom: insets.bottom > 0 ? insets.bottom : 20 }]}>
          <TextInput
            mode="outlined"
            placeholder="Ask a scheduling question..."
            value={inputText}
            onChangeText={setInputText}
            style={styles.textInput}
            activeOutlineColor="#002d72"
            outlineColor="#ccc"
            multiline={true}
            paddingTop = "20"
            // Send when hitting enter on the keyboard
            onSubmitEditing={sendMessage} 
          />
          <IconButton
            icon="send"
            iconColor="#fff"
            containerColor={inputText.trim() ? "#002d72" : "#ccc"}
            size={24}
            onPress={sendMessage}
            disabled={!inputText.trim()}
            style={styles.sendButton}
          />
        </View>

      </KeyboardAvoidingView>
    </View>
  );
}

// --- STYLES ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  chatArea: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 10 },
  
  // Message Rows
  messageRow: { flexDirection: 'row', marginBottom: 15, alignItems: 'flex-end' },
  userRow: { justifyContent: 'flex-end' },
  botRow: { justifyContent: 'flex-start' },
  
  // Avatars
  botAvatar: { backgroundColor: '#A5093E', marginRight: 8 },

  // Bubbles
  bubble: { maxWidth: '80%', padding: 12, borderRadius: 16, elevation: 1, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  userBubble: { backgroundColor: '#002d72', borderBottomRightRadius: 4 },
  botBubble: { backgroundColor: '#fff', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#eee' },
  
  // Text
  messageText: { fontSize: 16, lineHeight: 22 },
  userText: { color: '#fff' },
  botText: { color: '#333' },
  
  // Timestamps
  timestamp: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  userTimestamp: { color: 'rgba(255,255,255,0.7)' },
  botTimestamp: { color: '#999' },

  // Typing Indicator
  typingIndicatorContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 10 },

  // Input Area
  inputContainer: { flexDirection: 'row', padding: 10, backgroundColor: '#fff', alignItems: 'flex-end', borderTopWidth: 1, borderColor: '#eee' },
  textInput: { flex: 1, backgroundColor: '#fff', maxHeight: 100, paddingTop: 8},
  sendButton: { marginBottom: 6, marginLeft: 8 },
});
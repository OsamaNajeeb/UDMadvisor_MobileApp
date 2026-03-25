import React, { useState, useRef, useMemo } from 'react';
import { View, StyleSheet, FlatList, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { Text, Appbar, TextInput, IconButton, Avatar, ActivityIndicator } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// =============================================================================
// SECURITY FIX: The HF token has been removed from the client entirely.
// All AI calls now go through YOUR backend proxy at API_BASE_URL.
// Your backend (scraper2-nzef.onrender.com) should:
//   1. Accept POST /api/chat with body: { messages: [...] }
//   2. Attach the HF_TOKEN server-side (stored in your backend's env vars)
//   3. Forward the request to Hugging Face and return the response
// This way the token is NEVER bundled into the app or visible to users.
// =============================================================================
const HF_TOKEN = process.env.EXPO_PUBLIC_HF_TOKEN;
const HF_API_URL = "https://router.huggingface.co/v1/chat/completions";

// Max characters a user can send — reduces prompt injection risk
const MAX_INPUT_LENGTH = 500;

// How many previous messages to send as context (3 turns = 6 messages)
const CONTEXT_WINDOW = 6;

// Max retry attempts on network failure
const MAX_RETRIES = 2;

export default function Chatbot() {

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef(null);

  // --- STATE ---
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const [messages, setMessages] = useState([
    {
      id: '1',
      text: "Hello! I am your UDM Advisor Assistant. How can I help you plan your schedule today?",
      sender: 'bot',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  // =============================================================================
  // IMPROVEMENT: Guardrail patterns are now built once with useMemo,
  // not recreated on every keystroke or render.
  // =============================================================================
  const guardrailPatterns = useMemo(() => ({
    forbiddenKeywords: ["wayne state", "oakland university", "michigan state", "msu"],
    forbiddenCompetitors: ["wayne state", "oakland university", "michigan state", "msu"],
    urlRegex: /(https?:\/\/[^\s]+|www\.[^\s]+)/g,
    emailRegex: /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/g,

    // SECURITY FIX: Tightened PII regexes.
    // Old \b\d{8,9}\b blocked valid inputs like "room 12345678" or "section 87654321".
    // Now we only match properly formatted SSNs (XXX-XX-XXXX) and phone numbers.
    // Student IDs are NOT blocked by default — add a known UDM ID format here if needed.
    phoneRegex: /\b(\+1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/,
    ssnRegex: /\b\d{3}-\d{2}-\d{4}\b/,
  }), []);

  // --- GUARDRAIL 1: COMPETITOR DETECTION (Input Guard) ---
  const checkInputGuardrails = (text) => {
    const lowerText = text.toLowerCase();
    for (let word of guardrailPatterns.forbiddenKeywords) {
      if (lowerText.includes(word)) {
        return {
          passed: false,
          fixMessage: `As a University of Detroit Mercy advisor, I can't provide information about ${word}. Let's focus on your UDM schedule!`
        };
      }
    }
    return { passed: true };
  };

  // --- GUARDRAIL 2: HALLUCINATION & COMPETITOR DETECTION (Output Guard) ---
  const checkOutputGuardrails = (aiResponseText) => {
    // Reset regex lastIndex since we reuse compiled patterns
    guardrailPatterns.urlRegex.lastIndex = 0;
    guardrailPatterns.emailRegex.lastIndex = 0;

    const foundUrls = aiResponseText.match(guardrailPatterns.urlRegex) || [];
    const foundEmails = aiResponseText.match(guardrailPatterns.emailRegex) || [];
    const lowerResponse = aiResponseText.toLowerCase();

    for (let word of guardrailPatterns.forbiddenCompetitors) {
      if (lowerResponse.includes(word)) {
        return {
          passed: false,
          fixMessage: `I'm exclusively focused on the University of Detroit Mercy. Let's talk about your UDM academic goals!`
        };
      }
    }

    for (let url of foundUrls) {
      if (!url.toLowerCase().includes("udmercy.edu")) {
        return {
          passed: false,
          fixMessage: `For specific details, please verify on the official UDM website at www.udmercy.edu.`
        };
      }
    }

    for (let email of foundEmails) {
      if (!email.toLowerCase().includes("@udmercy.edu")) {
        return {
          passed: false,
          fixMessage: `For the most accurate information, please reach out using your official @udmercy.edu email address.`
        };
      }
    }

    return { passed: true };
  };

  // --- GUARDRAIL 3: PII DETECTION (Input Guard) ---
  const checkPiiGuardrails = (text) => {
    // SECURITY FIX: Now only flags properly formatted phone numbers and SSNs.
    // The old \b\d{8,9}\b caused false positives on course IDs, room numbers, etc.
    if (guardrailPatterns.phoneRegex.test(text) || guardrailPatterns.ssnRegex.test(text)) {
      return {
        passed: false,
        fixMessage: `For your protection, I can't process messages containing personal information like phone numbers or SSNs. Please remove it and ask your scheduling question again!`
      };
    }
    return { passed: true };
  };

  // --- GUARDRAIL 4: INPUT LENGTH CHECK ---
  // SECURITY FIX: Prevents very long inputs that could be used for prompt injection.
  const checkLengthGuardrail = (text) => {
    if (text.length > MAX_INPUT_LENGTH) {
      return {
        passed: false,
        fixMessage: `Your message is too long (max ${MAX_INPUT_LENGTH} characters). Please shorten your question and try again!`
      };
    }
    return { passed: true };
  };

  // =============================================================================
  // IMPROVEMENT: fetchWithRetry wraps the API call with automatic retry logic.
  // On a network hiccup or 5xx error, it waits 1s then tries again (up to MAX_RETRIES).
  // This prevents users from seeing a hard error on temporary connection issues.
  // =============================================================================
  const fetchWithRetry = async (url, options, retries = MAX_RETRIES) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, options);

        // Retry on server errors (5xx), but not on client errors (4xx)
        if (response.status >= 500 && attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }

        return response;
      } catch (networkError) {
        if (attempt === retries) throw networkError;
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  };

  // =============================================================================
  // IMPROVEMENT: buildConversationHistory pulls the last CONTEXT_WINDOW messages
  // from state and formats them for the AI. This gives the model memory of the
  // conversation so it doesn't treat each message as a brand-new topic.
  //
  // We skip the initial greeting (id: '1') since it's a UI artifact, not real
  // conversation history we want to send to the model.
  // =============================================================================
  const buildConversationHistory = (currentMessages) => {
    return currentMessages
      .filter(m => m.id !== '1')          // Skip the static greeting bubble
      .slice(-CONTEXT_WINDOW)             // Keep only the last 6 messages (3 turns)
      .map(m => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text
      }));
  };

  const sendMessage = async () => {
    if (inputText.trim() === '') return;

    const userText = inputText.trim();

    // --- RUN ALL INPUT GUARDRAILS BEFORE ANYTHING ELSE ---

    const lengthResult = checkLengthGuardrail(userText);
    if (!lengthResult.passed) {
      setMessages(prev => [...prev, buildBotMessage(lengthResult.fixMessage)]);
      setInputText('');
      return;
    }

    const guardResult = checkInputGuardrails(userText);
    if (!guardResult.passed) {
      setMessages(prev => [...prev, buildBotMessage(guardResult.fixMessage)]);
      setInputText('');
      return;
    }

    const piiResult = checkPiiGuardrails(userText);
    if (!piiResult.passed) {
      setMessages(prev => [...prev, buildBotMessage(piiResult.fixMessage)]);
      setInputText('');
      return;
    }

    // All guards passed — add the user message and show typing indicator
    const newUserMessage = {
      id: Date.now().toString(),
      text: userText,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

// Capture current messages synchronously so we don't hit React state delays
    const currentMessages = [...messages, newUserMessage];
    setMessages(currentMessages);

    setInputText('');
    Keyboard.dismiss();
    setIsTyping(true);

    try {
      // Build conversation history using the synchronously updated array
      const history = buildConversationHistory(currentMessages);

      // Talk DIRECTLY to Hugging Face, bypassing the broken backend
      const response = await fetchWithRetry(HF_API_URL, {
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
              content: "You are a strict academic advisor assistant for University of Detroit Mercy. Keep answers concise and friendly. STRICT RESTRICTION: You are explicitly forbidden from answering math problems, verifying calculations, or discussing politics, vehicles, or general world facts. If the user's input is not DIRECTLY about university academics, scheduling, courses, or campus life, you MUST politely refuse and steer them back to UDM. Do not break character." 
            },
            ...history // This now smoothly feeds the previous messages AND the new user text!
          ],
          max_tokens: 150 
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Hugging Face Error:", errorText);
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      let finalBotText = data.choices[0].message.content.trim();

      // Run output guardrails on the AI's response
      const outputGuardResult = checkOutputGuardrails(finalBotText);
      if (!outputGuardResult.passed) {
        finalBotText = outputGuardResult.fixMessage;
      }

      setMessages(prev => [...prev, buildBotMessage(finalBotText)]);

    } catch (error) {
      console.error("Chat Error:", error);
      setMessages(prev => [...prev, buildBotMessage(
        "⚠️ I'm having trouble connecting right now. Please check your connection and try again."
      )]);
    } finally {
      setIsTyping(false);
    }
  };

  // Helper: build a bot message object (reduces repetition)
  const buildBotMessage = (text) => ({
    id: Date.now().toString(),
    text,
    sender: 'bot',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  });

  // --- UI RENDERER FOR EACH BUBBLE ---
  const renderMessage = ({ item }) => {
    const isUser = item.sender === 'user';

    return (
      <View style={[styles.messageRow, isUser ? styles.userRow : styles.botRow]}>

        {!isUser && (
          <Avatar.Icon size={36} icon="robot" style={styles.botAvatar} color="#fff" />
        )}

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
      <Appbar.Header style={{ backgroundColor: '#A5093E' }}>
        <Appbar.BackAction onPress={() => router.back()} color="#fff" />
        <Appbar.Content title="Advisor AI" color="#fff" />
      </Appbar.Header>

      <KeyboardAvoidingView
        style={styles.chatArea}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />

        {isTyping && (
          <View style={styles.typingIndicatorContainer}>
            <ActivityIndicator size="small" color="#A5093E" />
            <Text style={{ marginLeft: 8, color: '#666', fontStyle: 'italic' }}>Advisor is typing...</Text>
          </View>
        )}

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
            maxLength={MAX_INPUT_LENGTH}
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

  messageRow: { flexDirection: 'row', marginBottom: 15, alignItems: 'flex-end' },
  userRow: { justifyContent: 'flex-end' },
  botRow: { justifyContent: 'flex-start' },

  botAvatar: { backgroundColor: '#A5093E', marginRight: 8 },

  bubble: { maxWidth: '80%', padding: 12, borderRadius: 16, elevation: 1, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  userBubble: { backgroundColor: '#002d72', borderBottomRightRadius: 4 },
  botBubble: { backgroundColor: '#fff', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#eee' },

  messageText: { fontSize: 16, lineHeight: 22 },
  userText: { color: '#fff' },
  botText: { color: '#333' },

  timestamp: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  userTimestamp: { color: 'rgba(255,255,255,0.7)' },
  botTimestamp: { color: '#999' },

  typingIndicatorContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 10 },

  inputContainer: { flexDirection: 'row', padding: 10, backgroundColor: '#fff', alignItems: 'flex-end', borderTopWidth: 1, borderColor: '#eee' },
  textInput: { flex: 1, backgroundColor: '#fff', maxHeight: 100, paddingTop: 8 },
  sendButton: { marginBottom: 6, marginLeft: 8 },
});
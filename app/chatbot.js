import React, { useState, useRef } from 'react';
import { View, StyleSheet, FlatList, KeyboardAvoidingView, Platform, Keyboard, TouchableOpacity, Alert } from 'react-native';
import { Text, Appbar, TextInput, IconButton, Avatar, ActivityIndicator } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FeedbackButton from '../components/FeedbackButton';
import * as Clipboard from 'expo-clipboard'; // <-- Add this new import

const API_BASE_URL = "https://udmadvisor-server.onrender.com";
const MAX_INPUT_LENGTH = 500;
const MAX_RETRIES = 2;
const CONTEXT_WINDOW = 6;

export default function Chatbot() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef(null);

  // Receive filtered course data from chatbot_setup screen
  const { termName, termCode, subjects, courseCount, courseSummary } = useLocalSearchParams();

  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: '1',
      text: `Hello! I'm your UDM Advisor for ${termName || 'this term'}. I have ${courseCount || 'your'} courses loaded for ${subjects ? subjects.replace(/,/g, ', ') : 'your selected subjects'}. Ask me about sections, times, credits, prerequisites, or help planning your schedule!`,
      sender: 'bot',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  // --- HELPERS ---
  const copyToClipboard = async (text) => {
    await Clipboard.setStringAsync(text);
    Alert.alert("Copied!", "Message copied to clipboard.");
  };

  const buildBotMessage = (text) => ({
    id: Date.now().toString(),
    text,
    sender: 'bot',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  });

  const buildConversationHistory = (currentMessages) => {
    return currentMessages
      .filter(m => m.id !== '1')
      .slice(-CONTEXT_WINDOW)
      .map(m => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text
      }));
  };

  const fetchWithRetry = async (url, options, retries = MAX_RETRIES) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, options);
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

  const sendMessage = async () => {
    if (inputText.trim() === '') return;

    const userText = inputText.trim();

    const newUserMessage = {
      id: Date.now().toString(),
      text: userText,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const currentMessages = [...messages, newUserMessage];
    setMessages(currentMessages);
    setInputText('');
    Keyboard.dismiss();
    setIsTyping(true);

    try {
      const history = buildConversationHistory(currentMessages);

      const response = await fetchWithRetry(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          conversation_history: history,
          // Send the pre-filtered course data so the server injects it into the AI prompt
          term_name: termName || '',
          course_summary: courseSummary || '',
        }),
      });

      const rawText = await response.text();
      let data;
      try {
        data = JSON.parse(rawText);
      } catch (e) {
        throw new Error("Server is starting up — please try again in a moment.");
      }

      const botText = (data.message || "I couldn't generate a response. Please try again.").trim();
      setMessages(prev => [...prev, buildBotMessage(botText)]);

    } catch (error) {
      console.error("Chat Error:", error);
      setMessages(prev => [...prev, buildBotMessage(
        "⚠️ I'm having trouble connecting right now. Please check your connection and try again."
      )]);
    } finally {
      setIsTyping(false);
    }
  };

// --- RENDER MESSAGE BUBBLE ---
  const renderMessage = ({ item }) => {
    const isUser = item.sender === 'user';
    return (
      <View style={[styles.messageRow, isUser ? styles.userRow : styles.botRow]}>
        {!isUser && (
          <Avatar.Icon size={36} icon="robot" style={styles.botAvatar} color="#fff" />
        )}
        {/* Changed from View to TouchableOpacity */}
        <TouchableOpacity 
          style={[styles.bubble, isUser ? styles.userBubble : styles.botBubble]}
          onLongPress={() => copyToClipboard(item.text)}
          activeOpacity={0.8} // Prevents it from flashing totally transparent when pressed
        >
          <Text style={[styles.messageText, isUser ? styles.userText : styles.botText]}>
            {item.text}
          </Text>
          <Text style={[styles.timestamp, isUser ? styles.userTimestamp : styles.botTimestamp]}>
            {item.timestamp}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: '#A5093E' }}>
        <Appbar.BackAction onPress={() => router.back()} color="#fff" />
        <Appbar.Content title={`Advisor AI — ${termName || 'Chat'}`} color="#fff" />
      </Appbar.Header>

      <KeyboardAvoidingView
        style={styles.chatArea}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0} // Adjust this ~90 value if your header is taller/shorter
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled" // Add this line
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
            placeholder="Ask about courses, prereqs, scheduling..."
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
      {/* <FeedbackButton /> */}
    </View>
  );
}

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
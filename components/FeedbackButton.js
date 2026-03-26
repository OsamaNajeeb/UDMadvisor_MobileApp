import React, { useState } from 'react';
import { View, StyleSheet, Modal, Alert } from 'react-native';
import { FAB, Text, TextInput, Button, IconButton } from 'react-native-paper';

export default function FeedbackButton() {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const sendFeedback = async () => {
    if (!message.trim()) {
      Alert.alert("Wait!", "Please enter a message first.");
      return;
    }

    setLoading(true);
    try {
      // Connects directly to the endpoint in your main.py!
      const response = await fetch("https://udmadvisor-server.onrender.com/send_feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ feedback_message: message })
      });

      if (response.ok) {
        Alert.alert("Success", "Thank you! Your feedback has been sent to the developers.");
        setMessage(''); // Clear the box
        setVisible(false); // Close the popup
      } else {
        throw new Error("Server returned an error");
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Could not connect to the server. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* 1. The Floating Action Button (FAB) */}
      <FAB
        icon="message-alert-outline"
        style={styles.fab}
        onPress={() => setVisible(true)}
        color="#fff"
        customSize={56} // Standard FAB size
      />

      {/* 2. The Popup Form */}
      <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={() => setVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text variant="titleLarge" style={{ fontWeight: 'bold', color: '#002d72' }}>Send Feedback</Text>
              <IconButton icon="close" size={20} onPress={() => setVisible(false)} />
            </View>
            
            <Text style={{ color: '#666', marginBottom: 15 }}>
              Found a bug or have a suggestion? Let us know!
            </Text>

            <TextInput
              mode="outlined"
              label="Describe the issue..."
              value={message}
              onChangeText={setMessage}
              multiline={true}
              numberOfLines={4}
              activeOutlineColor="#A5093E"
              style={{ backgroundColor: '#fff', marginBottom: 20 }}
            />

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <Button mode="outlined" textColor="#666" style={{ borderColor: '#ccc' }} onPress={() => setVisible(false)} disabled={loading}>
                Cancel
              </Button>
              <Button mode="contained" buttonColor="#002d72" onPress={sendFeedback} loading={loading} disabled={loading}>
                Submit
              </Button>
            </View>

          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0, // Docks it to the bottom right!
    backgroundColor: '#A5093E', 
    borderRadius: 30, // Makes it perfectly round
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  }
});
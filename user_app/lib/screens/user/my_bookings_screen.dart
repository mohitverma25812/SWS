import 'package:flutter/material.dart';
import 'package:flutter_rating_bar/flutter_rating_bar.dart';
import '../../services/api_service.dart';

class MyBookingsScreen extends StatefulWidget {
  const MyBookingsScreen({super.key});

  @override
  State<MyBookingsScreen> createState() => _MyBookingsScreenState();
}

class _MyBookingsScreenState extends State<MyBookingsScreen> {
  List<dynamic> myBookings = [];
  bool isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchBookings();
  }

  // 📦 Bookings fetch karne ka logic
  void _fetchBookings() async {
    final data = await ApiService.getMyBookings();
    if (mounted) {
      setState(() {
        myBookings = data;
        isLoading = false;
      });
    }
  }

  // ⭐ RATING DIALOG: Jab button click hoga tab ye khulega
  void showRatingDialog(BuildContext context, dynamic booking) {
    double userRating = 3.0;
    TextEditingController commentController = TextEditingController();

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text("Rate ${booking['worker']['name'] ?? 'Worker'}"),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text("Kaise rahi service?", style: TextStyle(fontSize: 16)),
            const SizedBox(height: 15),
            RatingBar.builder(
              initialRating: 3,
              minRating: 1,
              direction: Axis.horizontal,
              allowHalfRating: true,
              itemCount: 5,
              itemPadding: const EdgeInsets.symmetric(horizontal: 4.0),
              itemBuilder: (context, _) => const Icon(Icons.star, color: Colors.amber),
              onRatingUpdate: (rating) {
                userRating = rating;
              },
            ),
            const SizedBox(height: 15),
            TextField(
              controller: commentController,
              decoration: InputDecoration(
                hintText: "Koi sujhaav? (Optional)",
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text("Cancel"),
          ),
          ElevatedButton(
            onPressed: () async {
              // ✅ FIX: result ek Map hai, isliye result['success'] check kar rahe hain
              final result = await ApiService.submitRating(
                workerId: booking['worker']['_id'],
                userId: booking['user'],
                bookingId: booking['_id'],
                rating: userRating,
                comment: commentController.text,
              );

              if (result['success'] == true) {
                if (mounted) {
                  Navigator.pop(context);
                  _fetchBookings(); // List refresh karne ke liye
                  ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text("Rating submitted successfully!"))
                  );
                }
              } else {
                // Agar koi error aaye toh dikhao
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(result['message'] ?? "Error submitting rating"))
                  );
                }
              }
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.blueAccent),
            child: const Text("Submit", style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("My Bookings", style: TextStyle(color: Colors.white)),
        backgroundColor: Colors.blueAccent,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: isLoading
          ? const Center(child: CircularProgressIndicator())
          : myBookings.isEmpty
          ? const Center(child: Text("No bookings found!"))
          : ListView.builder(
        padding: const EdgeInsets.all(10),
        itemCount: myBookings.length,
        itemBuilder: (context, index) {
          final booking = myBookings[index];
          final worker = booking['worker'] ?? {};
          final rawStatus = (booking['status'] ?? 'pending').toString().toLowerCase();
          final statusDisplay = rawStatus.toUpperCase();

          return Card(
            elevation: 3,
            margin: const EdgeInsets.only(bottom: 12),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 8.0),
              child: ListTile(
                leading: const CircleAvatar(child: Icon(Icons.work_outline)),
                title: Text(worker['name'] ?? "Unknown Worker",
                    style: const TextStyle(fontWeight: FontWeight.bold)),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("Service: ${worker['serviceType'] ?? 'Professional'}"),
                    const SizedBox(height: 5),
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(
                            color: rawStatus == 'accepted'
                                ? Colors.green.shade100
                                : rawStatus == 'completed'
                                ? Colors.blue.shade100
                                : Colors.orange.shade100,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            statusDisplay,
                            style: TextStyle(
                              color: rawStatus == 'accepted'
                                  ? Colors.green
                                  : rawStatus == 'completed'
                                  ? Colors.blue
                                  : Colors.orange,
                              fontWeight: FontWeight.bold,
                              fontSize: 10,
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        // 🔥 RATING BUTTON: Status 'completed' hone par hi dikhega
                        if (rawStatus == 'completed')
                          InkWell(
                            onTap: () => showRatingDialog(context, booking),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                              decoration: BoxDecoration(
                                color: Colors.orange,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: const Text(
                                "RATE NOW",
                                style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
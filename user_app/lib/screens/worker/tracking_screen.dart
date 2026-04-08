import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';
import 'package:geolocator/geolocator.dart';
import '../../services/api_service.dart';

class TrackingScreen extends StatefulWidget {
  final String bookingId;
  final double workerLat;
  final double workerLng;
  final double userLat;
  final double userLng;
  final String userName;
  final String userPhone;

  const TrackingScreen({
    super.key,
    required this.bookingId,
    required this.workerLat,
    required this.workerLng,
    required this.userLat,
    required this.userLng,
    required this.userName,
    required this.userPhone,
  });

  @override
  State<TrackingScreen> createState() => _TrackingScreenState();
}

class _TrackingScreenState extends State<TrackingScreen> {
  final Completer<GoogleMapController> _controller = Completer();
  Set<Polyline> _polylines = {};
  Set<Marker> _markers = {};
  String distanceText = "Calculating...";
  String durationText = "...";

  late LatLng currentWorkerLocation;
  StreamSubscription<Position>? _positionStream;
  DateTime? _lastRouteUpdate;

  @override
  void initState() {
    super.initState();
    currentWorkerLocation = LatLng(widget.workerLat, widget.workerLng);
    _setMarkers(currentWorkerLocation);
    _getRoute(currentWorkerLocation);
    _startLiveTracking();
  }

  void _startLiveTracking() {
    const LocationSettings locationSettings = LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 5,
    );

    _positionStream = Geolocator.getPositionStream(locationSettings: locationSettings).listen(
          (Position position) {
        if (mounted) {
          LatLng newPos = LatLng(position.latitude, position.longitude);
          ApiService.updateLiveLocation(position.latitude, position.longitude);

          double distanceInMeters = Geolocator.distanceBetween(
            newPos.latitude, newPos.longitude,
            widget.userLat, widget.userLng,
          );

          double liveDistanceKm = distanceInMeters / 1000;
          int liveDurationMins = (liveDistanceKm / 25 * 60).round();

          setState(() {
            currentWorkerLocation = newPos;
            distanceText = "${liveDistanceKm.toStringAsFixed(1)} KM";
            durationText = "${liveDurationMins <= 1 ? 1 : liveDurationMins} MINS";
            _setMarkers(newPos);

            if (_lastRouteUpdate == null ||
                DateTime.now().difference(_lastRouteUpdate!).inSeconds > 30) {
              _getRoute(newPos);
              _lastRouteUpdate = DateTime.now();
            }
          });
          _moveCamera(newPos);
        }
      },
    );
  }

  Future<void> _moveCamera(LatLng pos) async {
    final GoogleMapController controller = await _controller.future;
    controller.animateCamera(CameraUpdate.newCameraPosition(
        CameraPosition(target: pos, zoom: 17, tilt: 40)
    ));
  }

  void _setMarkers(LatLng workerPos) {
    _markers = {
      Marker(
        markerId: const MarkerId("worker"),
        position: workerPos,
        infoWindow: const InfoWindow(title: "My Location"),
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueAzure),
      ),
      Marker(
        markerId: const MarkerId("user"),
        position: LatLng(widget.userLat, widget.userLng),
        infoWindow: InfoWindow(title: "Customer: ${widget.userName}"),
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
      ),
    };
    setState(() {});
  }

  Future<void> _getRoute(LatLng start) async {
    final String url =
        'http://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${widget.userLng},${widget.userLat}?geometries=geojson';

    try {
      final response = await http.get(Uri.parse(url));
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        final List coords = data['routes'][0]['geometry']['coordinates'];
        List<LatLng> points = coords.map((c) => LatLng(c[1], c[0])).toList();

        setState(() {
          _polylines = {
            Polyline(
              polylineId: const PolylineId("route"),
              points: points,
              color: Colors.blueAccent,
              width: 8,
              jointType: JointType.round,
              startCap: Cap.roundCap,
              endCap: Cap.roundCap,
            ),
          };
        });
      }
    } catch (e) {
      debugPrint("Route Error: $e");
    }
  }

  // 🔥 UPDATED: OTP Verification Dialog
  void _verifyAndComplete() async {
    TextEditingController otpController = TextEditingController();
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text("Verify Job OTP", style: TextStyle(fontWeight: FontWeight.bold)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text("Pahonch gaye? Customer se 4-digit OTP maangein aur yahan bharein."),
            const SizedBox(height: 15),
            TextField(
              controller: otpController,
              keyboardType: TextInputType.number,
              maxLength: 4,
              decoration: const InputDecoration(
                hintText: "Enter 4-digit OTP",
                border: OutlineInputBorder(),
                counterText: "",
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text("Cancel", style: TextStyle(color: Colors.grey)),
          ),
          ElevatedButton(
            onPressed: () async {
              // API Call to verify OTP
              bool ok = await ApiService.verifyOTP(widget.bookingId, otpController.text);
              if (ok) {
                // OTP sahi toh status update karo
                await ApiService.updateBookingStatus(widget.bookingId, "completed");
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text("Work Marked as Completed! ✅"), backgroundColor: Colors.green),
                  );
                  Navigator.pop(context); // Close dialog
                  Navigator.pop(context); // Wapas Dashboard par
                }
              } else {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text("Invalid OTP! Try again."), backgroundColor: Colors.red),
                  );
                }
              }
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.blueAccent),
            child: const Text("Verify & Finish", style: TextStyle(color: Colors.white)),
          )
        ],
      ),
    );
  }

  @override
  void dispose() {
    _positionStream?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Navigating to Job", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        backgroundColor: Colors.blueAccent,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: Stack(
        children: [
          GoogleMap(
            mapType: MapType.normal,
            initialCameraPosition: CameraPosition(target: currentWorkerLocation, zoom: 16),
            markers: _markers,
            polylines: _polylines,
            myLocationEnabled: false,
            onMapCreated: (GoogleMapController controller) {
              if (!_controller.isCompleted) _controller.complete(controller);
            },
          ),

          // BOTTOM INFO CARD
          Positioned(
            bottom: 0, left: 0, right: 0,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 15),
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(30)),
                boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 10)],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(durationText, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.blueAccent)),
                          Text(distanceText, style: const TextStyle(fontSize: 14, color: Colors.grey)),
                        ],
                      ),
                      FloatingActionButton.small(
                        backgroundColor: Colors.green,
                        onPressed: () => launchUrl(Uri.parse('tel:+91${widget.userPhone}')),
                        child: const Icon(Icons.call, color: Colors.white),
                      )
                    ],
                  ),
                  const Divider(height: 25),
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text("Customer Name:", style: TextStyle(fontSize: 12, color: Colors.grey)),
                            Text(widget.userName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                          ],
                        ),
                      ),
                      // 🔥 COMPLETE BUTTON: Calls _verifyAndComplete instead of _completeJob
                      ElevatedButton(
                        onPressed: _verifyAndComplete,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.orange,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                        ),
                        child: const Text("COMPLETE WORK", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                ],
              ),
            ),
          )
        ],
      ),
    );
  }
}
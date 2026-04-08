import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

class UserTrackingScreen extends StatefulWidget {
  final double workerLat;
  final double workerLng;
  final double userLat;
  final double userLng;
  final String workerName;
  final String workerPhone;

  const UserTrackingScreen({
    super.key,
    required this.workerLat,
    required this.workerLng,
    required this.userLat,
    required this.userLng,
    required this.workerName,
    required this.workerPhone,
  });

  @override
  State<UserTrackingScreen> createState() => _UserTrackingScreenState();
}

class _UserTrackingScreenState extends State<UserTrackingScreen> {
  final Completer<GoogleMapController> _controller = Completer();
  final Set<Polyline> _polylines = {};
  final Set<Marker> _markers = {};

  String distanceText = "Calculating...";
  String durationText = "...";

  @override
  void initState() {
    super.initState();
    _setMarkers();
    _getRoute();
  }

  void _setMarkers() {
    setState(() {
      _markers.add(
        Marker(
          markerId: const MarkerId("worker"),
          position: LatLng(widget.workerLat, widget.workerLng),
          infoWindow: InfoWindow(title: "Worker: ${widget.workerName}"),
          icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueAzure),
        ),
      );
      _markers.add(
        Marker(
          markerId: const MarkerId("user"),
          position: LatLng(widget.userLat, widget.userLng),
          infoWindow: const InfoWindow(title: "My Location"),
          icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
        ),
      );
    });
  }

  Future<void> _getRoute() async {
    final String url =
        'http://router.project-osrm.org/route/v1/driving/${widget.workerLng},${widget.workerLat};${widget.userLng},${widget.userLat}?geometries=geojson';

    try {
      final response = await http.get(Uri.parse(url));
      if (response.statusCode == 200) {
        final data = json.decode(response.body);

        if (data['routes'] != null && data['routes'].isNotEmpty) {
          final List coords = data['routes'][0]['geometry']['coordinates'];

          double distance = data['routes'][0]['distance'] / 1000;
          double duration = data['routes'][0]['duration'] / 60;

          List<LatLng> polylinePoints = coords.map((c) => LatLng(c[1], c[0])).toList();

          setState(() {
            distanceText = "${distance.toStringAsFixed(1)} KM";
            durationText = "${duration.round()} MINS";

            _polylines.add(
              Polyline(
                polylineId: const PolylineId("route"),
                points: polylinePoints,
                color: Colors.blue.shade700,
                width: 6,
              ),
            );
          });

          _fitMap();
        }
      }
    } catch (e) {
      debugPrint("Route Error: $e");
    }
  }

  Future<void> _fitMap() async {
    final GoogleMapController controller = await _controller.future;

    double minLat = (widget.workerLat < widget.userLat) ? widget.workerLat : widget.userLat;
    double maxLat = (widget.workerLat > widget.userLat) ? widget.workerLat : widget.userLat;
    double minLng = (widget.workerLng < widget.userLng) ? widget.workerLng : widget.userLng;
    double maxLng = (widget.workerLng > widget.userLng) ? widget.workerLng : widget.userLng;

    LatLngBounds bounds = LatLngBounds(
      southwest: LatLng(minLat, minLng),
      northeast: LatLng(maxLat, maxLng),
    );

    controller.animateCamera(CameraUpdate.newLatLngBounds(bounds, 70));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Track Worker", style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.white,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.black),
      ),
      body: Stack(
        children: [
          GoogleMap(
            mapType: MapType.normal,
            initialCameraPosition: CameraPosition(
              target: LatLng(widget.userLat, widget.userLng),
              zoom: 14,
            ),
            markers: _markers,
            polylines: _polylines,
            myLocationEnabled: true,
            onMapCreated: (GoogleMapController controller) {
              if (!_controller.isCompleted) {
                _controller.complete(controller);
              }
            },
          ),

          Positioned(
            bottom: 0, left: 0, right: 0,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 25),
              decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(25)),
                  boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.1), blurRadius: 10, offset: const Offset(0, -5))]
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
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.baseline,
                            textBaseline: TextBaseline.alphabetic,
                            children: [
                              Text(durationText, style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: Colors.green.shade700)),
                              const SizedBox(width: 8),
                              Text("($distanceText)", style: const TextStyle(fontSize: 16, color: Colors.grey, fontWeight: FontWeight.w500)),
                            ],
                          ),
                          const SizedBox(height: 5),
                          Text("Worker: ${widget.workerName}", style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                        ],
                      ),
                      FloatingActionButton(
                        backgroundColor: Colors.blueAccent,
                        onPressed: () async {
                          final Uri callUri = Uri.parse('tel:+91${widget.workerPhone}');
                          if (await canLaunchUrl(callUri)) await launchUrl(callUri);
                        },
                        child: const Icon(Icons.call, color: Colors.white),
                      )
                    ],
                  ),
                ],
              ),
            ),
          )
        ],
      ),
    );
  }
}
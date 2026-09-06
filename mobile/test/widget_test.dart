import 'package:flutter_test/flutter_test.dart';
import 'package:vitalsync/main.dart';

void main() {
  testWidgets('VitalsSync App smoke test', (WidgetTester tester) async {
    // Build our app and trigger a frame.
    await tester.pumpWidget(const VitalsSyncApp());
    expect(find.byType(VitalsSyncApp), findsOneWidget);
  });
}

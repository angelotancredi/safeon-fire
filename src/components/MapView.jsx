import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useWebRTC } from '../hooks/useWebRTC';
import { LocateFixed, User, Users } from 'lucide-react';

// fix Leaflet default icon issue
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
});

// custom markers
const createCustomIcon = (color) => new L.DivIcon({
    className: 'custom-div-icon',
    html: `<div style="background-color: ${color}; width: 12px; height: 12px; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(0,0,0,0.3);"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6]
});

const myIcon = createCustomIcon('#FF5722'); // Tactical Orange
const peerIcon = createCustomIcon('#10B981'); // Tactical Green

function MapController({ center }) {
    const map = useMap();
    useEffect(() => {
        if (center) {
            map.setView(center, map.getZoom());
        }
    }, [center, map]);
    return null;
}

const MapView = () => {
    const { myLocation, peerLocations, isConnected } = useWebRTC();
    const [mapCenter, setMapCenter] = useState([37.5665, 126.9780]); // Seoul Static Default
    const [hasSetInitial, setHasSetInitial] = useState(false);

    useEffect(() => {
        if (myLocation && !hasSetInitial) {
            setMapCenter([myLocation.lat, myLocation.lng]);
            setHasSetInitial(true);
        }
    }, [myLocation, hasSetInitial]);

    const handleRecenter = () => {
        if (myLocation) {
            setMapCenter([myLocation.lat, myLocation.lng]);
        }
    };

    return (
        <div className="relative w-full h-full bg-tactical-bg overflow-hidden flex flex-col">
            {/* Map UI Overlay */}
            <div className="absolute top-4 left-4 z-[1000] flex flex-col space-y-2">
                <div className="bg-white/90 backdrop-blur-md border border-tactical-border px-3 py-1.5 rounded-xl shadow-lg flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-tactical-ok animate-pulse' : 'bg-tactical-muted'}`} />
                    <span className="text-[10px] font-black tracking-widest uppercase text-tactical-fg">Tactical Map Link</span>
                </div>
            </div>

            <button
                onClick={handleRecenter}
                className="absolute bottom-24 right-4 z-[1000] w-12 h-12 bg-white border-2 border-tactical-border rounded-2xl flex items-center justify-center shadow-xl active:scale-95 transition-all hover:bg-tactical-surface"
            >
                <LocateFixed className="w-6 h-6 text-tactical-accent" />
            </button>

            <div className="flex-1 w-full bg-neutral-200">
                <MapContainer
                    center={mapCenter}
                    zoom={16}
                    className="w-full h-full"
                    zoomControl={false}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    <MapController center={mapCenter} />

                    {/* My Location Marker */}
                    {myLocation && (
                        <Marker position={[myLocation.lat, myLocation.lng]} icon={myIcon}>
                            <Popup>
                                <div className="text-[10px] font-black uppercase text-tactical-fg">본인 (You)</div>
                            </Popup>
                        </Marker>
                    )}

                    {/* Peer Location Markers */}
                    {Object.entries(peerLocations).map(([id, loc]) => (
                        <Marker key={id} position={[loc.lat, loc.lng]} icon={peerIcon}>
                            <Popup>
                                <div className="text-[10px] font-black uppercase text-tactical-fg">
                                    대원: {id.split('-').pop().toUpperCase()}
                                </div>
                            </Popup>
                        </Marker>
                    ))}
                </MapContainer>
            </div>

            {/* Bottom Status Bar */}
            <div className="h-12 bg-white border-t border-tactical-border flex items-center justify-between px-4 shrink-0">
                <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-1.5">
                        <User className="w-3.5 h-3.5 text-tactical-accent" />
                        <span className="text-[9px] font-bold text-tactical-muted">MY GPS: {myLocation ? `${myLocation.lat.toFixed(4)}, ${myLocation.lng.toFixed(4)}` : 'WAITING...'}</span>
                    </div>
                </div>
                <div className="flex items-center space-x-1.5 opacity-60">
                    <Users className="w-3.5 h-3.5 text-tactical-ok" />
                    <span className="text-[9px] font-bold text-tactical-muted">{Object.keys(peerLocations).length} NODES TRACKED</span>
                </div>
            </div>
        </div>
    );
};

export default MapView;

--
-- PostgreSQL database dump
--

\restrict DeA2jxvm4vJRNxejQrvIReXOzCZ40D5fL6SJcY8NTaS1AhoaNNgqcwaHzmRXDAR

-- Dumped from database version 16.15 (Debian 16.15-1.pgdg13+2)
-- Dumped by pg_dump version 16.15 (Debian 16.15-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: cuentas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cuentas (
    id integer NOT NULL,
    email character varying NOT NULL,
    nombre character varying NOT NULL,
    "passwordHash" character varying NOT NULL,
    "creadaEn" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: cuentas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cuentas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cuentas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cuentas_id_seq OWNED BY public.cuentas.id;


--
-- Name: gds_holds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gds_holds (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "vehiculoId" integer NOT NULL,
    "searchToken" character varying NOT NULL,
    "driverAge" integer,
    "fechaRecogida" date NOT NULL,
    "fechaDevolucion" date NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "creadoEn" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: gds_idempotencia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gds_idempotencia (
    clave character varying NOT NULL,
    respuesta jsonb NOT NULL,
    "creadoEn" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: gds_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gds_orders (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    locator character varying NOT NULL,
    estado character varying DEFAULT 'CONFIRMED'::character varying NOT NULL,
    "vehiculoId" integer NOT NULL,
    "vehiculoSnapshot" jsonb NOT NULL,
    "fechaRecogida" date NOT NULL,
    "fechaDevolucion" date NOT NULL,
    ruta jsonb NOT NULL,
    extras text DEFAULT ''::text NOT NULL,
    "precioTotal" numeric(10,2) NOT NULL,
    moneda character varying(3) NOT NULL,
    "driverDetails" jsonb NOT NULL,
    "paymentReference" character varying NOT NULL,
    "creadoEn" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: gds_previews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gds_previews (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "vehiculoId" integer NOT NULL,
    "holdId" uuid,
    extras text DEFAULT ''::text NOT NULL,
    "fechaRecogida" date NOT NULL,
    "fechaDevolucion" date NOT NULL,
    ruta jsonb NOT NULL,
    moneda character varying(3) NOT NULL,
    "precioTotal" numeric(10,2) NOT NULL,
    desglose jsonb NOT NULL,
    consumida boolean DEFAULT false NOT NULL,
    "creadoEn" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: gds_webhooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gds_webhooks (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    url character varying NOT NULL,
    events text NOT NULL,
    secret character varying,
    "creadoEn" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: reservas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reservas (
    id integer NOT NULL,
    codigo character varying NOT NULL,
    "vehiculoId" integer NOT NULL,
    "sucursalRecogidaId" integer NOT NULL,
    "sucursalDevolucionId" integer NOT NULL,
    "fechaRecogida" date NOT NULL,
    "horaRecogida" character varying DEFAULT '10:00'::character varying NOT NULL,
    "fechaDevolucion" date NOT NULL,
    "horaDevolucion" character varying DEFAULT '10:00'::character varying NOT NULL,
    "nombreCliente" character varying NOT NULL,
    email character varying NOT NULL,
    telefono character varying NOT NULL,
    dias integer NOT NULL,
    total numeric(10,2) NOT NULL,
    estado character varying DEFAULT 'CONFIRMADA'::character varying NOT NULL,
    "creadaEn" timestamp without time zone DEFAULT now() NOT NULL,
    "cuentaId" integer,
    "pagoReferencia" character varying,
    "tarjetaUltimos4" character varying
);


--
-- Name: reservas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reservas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reservas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reservas_id_seq OWNED BY public.reservas.id;


--
-- Name: sucursales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sucursales (
    id integer NOT NULL,
    nombre character varying NOT NULL,
    ciudad character varying NOT NULL,
    direccion character varying NOT NULL,
    "esAeropuerto" boolean DEFAULT false NOT NULL
);


--
-- Name: sucursales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sucursales_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sucursales_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sucursales_id_seq OWNED BY public.sucursales.id;


--
-- Name: vehiculos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehiculos (
    id integer NOT NULL,
    marca character varying NOT NULL,
    modelo character varying NOT NULL,
    anio integer NOT NULL,
    categoria character varying NOT NULL,
    transmision character varying NOT NULL,
    pasajeros integer NOT NULL,
    maletas integer NOT NULL,
    puertas integer NOT NULL,
    combustible character varying NOT NULL,
    "aireAcondicionado" boolean DEFAULT true NOT NULL,
    "precioPorDia" numeric(10,2) NOT NULL,
    "sucursalId" integer NOT NULL
);


--
-- Name: vehiculos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vehiculos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vehiculos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vehiculos_id_seq OWNED BY public.vehiculos.id;


--
-- Name: cuentas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas ALTER COLUMN id SET DEFAULT nextval('public.cuentas_id_seq'::regclass);


--
-- Name: reservas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas ALTER COLUMN id SET DEFAULT nextval('public.reservas_id_seq'::regclass);


--
-- Name: sucursales id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sucursales ALTER COLUMN id SET DEFAULT nextval('public.sucursales_id_seq'::regclass);


--
-- Name: vehiculos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehiculos ALTER COLUMN id SET DEFAULT nextval('public.vehiculos_id_seq'::regclass);


--
-- Data for Name: cuentas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cuentas (id, email, nombre, "passwordHash", "creadaEn") FROM stdin;
1	cliente1@correo.com	Cliente Uno	1a0b88bb31e38bfe342d8fda476f33b6:1c778ddf23e04316c96bfbd81a367894bebac46e9f62b578bf994ff13cef0714dfff7d123fb29b65fa3f31dc4c97eff9cbfa5f248f5905d88c3f269fec8adc63	2026-10-07 03:18:56.736057
2	cliente2@correo.com	Cliente Dos	afc3f290623522d995168b2ce2081bde:ba39899f632567aa8c9cd691dc69e40b63e66ec648921b34cb7a1f7dea8514a5cc62c19462131220b5d50d583885dcd9a805f733cf1bce15e825e2eebc4187c5	2026-10-07 03:18:56.844864
3	cliente3@correo.com	Cliente Tres	539175179eb772329ee9b646aa40614c:75864c510de079e8f59cfab23f8202d0000d3adf5b8c31782fca7267207c87cbc25cee08c40db849627c37c0f58b414aef3db2ac3faac3a110204685f8071261	2026-10-07 03:18:56.954669
\.


--
-- Data for Name: gds_holds; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.gds_holds (id, "vehiculoId", "searchToken", "driverAge", "fechaRecogida", "fechaDevolucion", "expiresAt", "creadoEn") FROM stdin;
ed2e05e4-4fb8-439e-81d2-6fdc523a259c	8	eyJjdXJyZW5jeSI6IlVTRCIsInJvdXRlIjp7InBpY2t1cCI6eyJkYXRldGltZSI6IjIwMjYtMTAtMDVUMTA6MDA6MDBaIiwibG9jYXRpb24iOnsiY2l0eV9pZCI6MX19LCJkcm9wb2ZmIjp7ImRhdGV0aW1lIjoiMjAyNi0xMC0wOFQxMDowMDowMFoiLCJsb2NhdGlvbiI6eyJjaXR5X2lkIjoxfX19LCJleHAiOjE3OTA2MDQ4ODI4Njd9	30	2026-10-05	2026-10-08	2026-09-28 14:10:04.855+00	2026-09-28 14:00:04.861387
ed8e21a7-8b3e-4f0a-bbda-d9800fbb087b	9	eyJjdXJyZW5jeSI6IlVTRCIsInJvdXRlIjp7InBpY2t1cCI6eyJkYXRldGltZSI6IjIwMjYtMTAtMDVUMTA6MDA6MDBaIiwibG9jYXRpb24iOnsiY2l0eV9pZCI6MX19LCJkcm9wb2ZmIjp7ImRhdGV0aW1lIjoiMjAyNi0xMC0wOFQxMDowMDowMFoiLCJsb2NhdGlvbiI6eyJjaXR5X2lkIjoxfX19LCJleHAiOjE3OTA2MDQ4ODI4Njd9	30	2026-10-05	2026-10-08	2026-09-28 14:11:56.271+00	2026-09-28 14:01:56.2803
\.


--
-- Data for Name: gds_idempotencia; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.gds_idempotencia (clave, respuesta, "creadoEn") FROM stdin;
c8b96338-1d67-4530-9b0f-622cc51eb138:POST /api/v1/orders/create	{"_links": {"self": "/api/v1/orders/2ce840ce-e501-4beb-a047-cf822237cb21", "cancel": "/api/v1/orders/2ce840ce-e501-4beb-a047-cf822237cb21/cancel", "modify": "/api/v1/orders/2ce840ce-e501-4beb-a047-cf822237cb21/modify"}, "status": "CONFIRMED", "locator": "AUTO-8T9MBA", "currency": "USD", "order_id": "2ce840ce-e501-4beb-a047-cf822237cb21", "total_price": 75, "creation_date": "2026-09-28T19:00:12.759Z", "route_details": {"pickup": {"datetime": "2026-10-05T10:00:00Z", "location": {"city_id": 1}}, "dropoff": {"datetime": "2026-10-08T10:00:00Z", "location": {"city_id": 1}}}, "vehicle_details": {"anio": 2024, "marca": "Renault", "modelo": "Kwid", "maletas": 1, "puertas": 5, "categoria": "ECONOMICO", "pasajeros": 4, "vehicle_id": "8", "combustible": "GASOLINA", "transmision": "MANUAL", "precio_por_dia": 22}}	2026-09-28 14:00:12.806034
2f6f8279-18be-40eb-855a-9f944e9b4dbf:POST /api/v1/orders/:orderId/modify	{"_links": {"self": "/api/v1/orders/2ce840ce-e501-4beb-a047-cf822237cb21", "cancel": "/api/v1/orders/2ce840ce-e501-4beb-a047-cf822237cb21/cancel", "modify": "/api/v1/orders/2ce840ce-e501-4beb-a047-cf822237cb21/modify"}, "status": "CONFIRMED", "locator": "AUTO-8T9MBA", "currency": "USD", "order_id": "2ce840ce-e501-4beb-a047-cf822237cb21", "total_price": 90, "creation_date": "2026-09-28T19:00:12.759Z", "route_details": {"pickup": {"datetime": "2026-10-05T10:00:00Z", "location": {"city_id": 1}}, "dropoff": {"datetime": "2026-10-08T10:00:00Z", "location": {"city_id": 1}}}, "vehicle_details": {"anio": 2024, "marca": "Renault", "modelo": "Kwid", "maletas": 1, "puertas": 5, "categoria": "ECONOMICO", "pasajeros": 4, "vehicle_id": "8", "combustible": "GASOLINA", "transmision": "MANUAL", "precio_por_dia": 22}}	2026-09-28 14:00:23.484757
d468295e-3ff2-40a2-acd5-c8a656dab353:POST /api/v1/orders/:orderId/cancel	{"_links": {"self": "/api/v1/orders/2ce840ce-e501-4beb-a047-cf822237cb21"}, "status": "CANCELLED", "locator": "AUTO-8T9MBA", "currency": "USD", "order_id": "2ce840ce-e501-4beb-a047-cf822237cb21", "total_price": 90, "creation_date": "2026-09-28T19:00:12.759Z", "route_details": {"pickup": {"datetime": "2026-10-05T10:00:00Z", "location": {"city_id": 1}}, "dropoff": {"datetime": "2026-10-08T10:00:00Z", "location": {"city_id": 1}}}, "vehicle_details": {"anio": 2024, "marca": "Renault", "modelo": "Kwid", "maletas": 1, "puertas": 5, "categoria": "ECONOMICO", "pasajeros": 4, "vehicle_id": "8", "combustible": "GASOLINA", "transmision": "MANUAL", "precio_por_dia": 22}}	2026-09-28 14:00:24.108194
c53c8aea-7089-4d5f-8ce2-4d6e5ff6c572:POST /api/v1/orders/create	{"_links": {"self": "/api/v1/orders/20bff74f-cdea-4eba-b06a-f7ec292d7f78", "cancel": "/api/v1/orders/20bff74f-cdea-4eba-b06a-f7ec292d7f78/cancel", "modify": "/api/v1/orders/20bff74f-cdea-4eba-b06a-f7ec292d7f78/modify"}, "status": "CONFIRMED", "locator": "AUTO-DWLCYF", "currency": "USD", "order_id": "20bff74f-cdea-4eba-b06a-f7ec292d7f78", "total_price": 75, "creation_date": "2026-09-28T19:05:01.628Z", "route_details": {"pickup": {"datetime": "2026-10-05T10:00:00Z", "location": {"city_id": 1}}, "dropoff": {"datetime": "2026-10-08T10:00:00Z", "location": {"city_id": 1}}}, "vehicle_details": {"anio": 2023, "marca": "Volkswagen", "modelo": "Gol", "maletas": 2, "puertas": 5, "categoria": "ECONOMICO", "pasajeros": 5, "vehicle_id": "7", "combustible": "GASOLINA", "transmision": "MANUAL", "precio_por_dia": 25}}	2026-09-28 14:05:01.711743
284a3f06-4290-46a1-8123-f8ed23ce3736:POST /api/v1/orders/:orderId/cancel	{"_links": {"self": "/api/v1/orders/20bff74f-cdea-4eba-b06a-f7ec292d7f78"}, "status": "CANCELLED", "locator": "AUTO-DWLCYF", "currency": "USD", "order_id": "20bff74f-cdea-4eba-b06a-f7ec292d7f78", "total_price": 75, "creation_date": "2026-09-28T19:05:01.628Z", "route_details": {"pickup": {"datetime": "2026-10-05T10:00:00Z", "location": {"city_id": 1}}, "dropoff": {"datetime": "2026-10-08T10:00:00Z", "location": {"city_id": 1}}}, "vehicle_details": {"anio": 2023, "marca": "Volkswagen", "modelo": "Gol", "maletas": 2, "puertas": 5, "categoria": "ECONOMICO", "pasajeros": 5, "vehicle_id": "7", "combustible": "GASOLINA", "transmision": "MANUAL", "precio_por_dia": 25}}	2026-09-28 14:05:02.478616
f354f085-b948-4d61-84fd-4c47f5b50b2a:POST /api/v1/orders/create	{"_links": {"self": "/api/v1/orders/b837e48b-bf70-48ba-a51d-a9d5aae62bfc", "cancel": "/api/v1/orders/b837e48b-bf70-48ba-a51d-a9d5aae62bfc/cancel", "modify": "/api/v1/orders/b837e48b-bf70-48ba-a51d-a9d5aae62bfc/modify"}, "status": "CONFIRMED", "locator": "AUTO-6YLZY7", "currency": "USD", "order_id": "b837e48b-bf70-48ba-a51d-a9d5aae62bfc", "total_price": 156, "creation_date": "2026-09-28T19:07:45.564Z", "route_details": {"pickup": {"datetime": "2026-10-05T10:00:00Z", "location": {"city_id": 1}}, "dropoff": {"datetime": "2026-10-08T10:00:00Z", "location": {"city_id": 1}}}, "vehicle_details": {"anio": 2024, "marca": "Honda", "modelo": "Civic", "maletas": 3, "puertas": 4, "categoria": "INTERMEDIO", "pasajeros": 5, "vehicle_id": "6", "combustible": "GASOLINA", "transmision": "AUTOMATICA", "precio_por_dia": 52}}	2026-09-28 14:07:45.665411
5d52498a-b5af-4557-8b8a-e295f3d376c4:POST /api/v1/orders/:orderId/cancel	{"_links": {"self": "/api/v1/orders/b837e48b-bf70-48ba-a51d-a9d5aae62bfc"}, "status": "CANCELLED", "locator": "AUTO-6YLZY7", "currency": "USD", "order_id": "b837e48b-bf70-48ba-a51d-a9d5aae62bfc", "total_price": 156, "creation_date": "2026-09-28T19:07:45.564Z", "route_details": {"pickup": {"datetime": "2026-10-05T10:00:00Z", "location": {"city_id": 1}}, "dropoff": {"datetime": "2026-10-08T10:00:00Z", "location": {"city_id": 1}}}, "vehicle_details": {"anio": 2024, "marca": "Honda", "modelo": "Civic", "maletas": 3, "puertas": 4, "categoria": "INTERMEDIO", "pasajeros": 5, "vehicle_id": "6", "combustible": "GASOLINA", "transmision": "AUTOMATICA", "precio_por_dia": 52}}	2026-09-28 14:07:49.098607
\.


--
-- Data for Name: gds_orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.gds_orders (id, locator, estado, "vehiculoId", "vehiculoSnapshot", "fechaRecogida", "fechaDevolucion", ruta, extras, "precioTotal", moneda, "driverDetails", "paymentReference", "creadoEn") FROM stdin;
2ce840ce-e501-4beb-a047-cf822237cb21	AUTO-8T9MBA	CANCELLED	8	{"anio": 2024, "marca": "Renault", "modelo": "Kwid", "maletas": 1, "puertas": 5, "categoria": "ECONOMICO", "pasajeros": 4, "vehicle_id": "8", "combustible": "GASOLINA", "transmision": "MANUAL", "precio_por_dia": 22}	2026-10-05	2026-10-08	{"pickup": {"datetime": "2026-10-05T10:00:00Z", "location": {"city_id": 1}}, "dropoff": {"datetime": "2026-10-08T10:00:00Z", "location": {"city_id": 1}}}	GPS,CHILD_SEAT	90.00	USD	{"email": "estebangarciaojeda@gmail.com", "last_name": "Garcia", "first_name": "Esteban", "phone_number": "+593999999999"}	PAY-TEST-001	2026-09-28 14:00:12.759851
20bff74f-cdea-4eba-b06a-f7ec292d7f78	AUTO-DWLCYF	CANCELLED	7	{"anio": 2023, "marca": "Volkswagen", "modelo": "Gol", "maletas": 2, "puertas": 5, "categoria": "ECONOMICO", "pasajeros": 5, "vehicle_id": "7", "combustible": "GASOLINA", "transmision": "MANUAL", "precio_por_dia": 25}	2026-10-05	2026-10-08	{"pickup": {"datetime": "2026-10-05T10:00:00Z", "location": {"city_id": 1}}, "dropoff": {"datetime": "2026-10-08T10:00:00Z", "location": {"city_id": 1}}}		75.00	USD	{"email": "ana@example.com", "last_name": "Lopez", "first_name": "Ana", "phone_number": "+593988888888"}	PAY-002	2026-09-28 14:05:01.628631
b837e48b-bf70-48ba-a51d-a9d5aae62bfc	AUTO-6YLZY7	CANCELLED	6	{"anio": 2024, "marca": "Honda", "modelo": "Civic", "maletas": 3, "puertas": 4, "categoria": "INTERMEDIO", "pasajeros": 5, "vehicle_id": "6", "combustible": "GASOLINA", "transmision": "AUTOMATICA", "precio_por_dia": 52}	2026-10-05	2026-10-08	{"pickup": {"datetime": "2026-10-05T10:00:00Z", "location": {"city_id": 1}}, "dropoff": {"datetime": "2026-10-08T10:00:00Z", "location": {"city_id": 1}}}		156.00	USD	{"email": "carlos@example.com", "last_name": "Ruiz", "first_name": "Carlos", "phone_number": "+593977777777"}	PAY-003	2026-09-28 14:07:45.56496
\.


--
-- Data for Name: gds_previews; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.gds_previews (id, "vehiculoId", "holdId", extras, "fechaRecogida", "fechaDevolucion", ruta, moneda, "precioTotal", desglose, consumida, "creadoEn") FROM stdin;
c4dee4c3-77a8-4791-a541-1ce253bd3676	8	ed2e05e4-4fb8-439e-81d2-6fdc523a259c	GPS	2026-10-05	2026-10-08	{"pickup": {"datetime": "2026-10-05T10:00:00Z", "location": {"city_id": 1}}, "dropoff": {"datetime": "2026-10-08T10:00:00Z", "location": {"city_id": 1}}}	USD	75.00	{"taxes": 0, "total": 75, "base_price": 66, "extras_price": 9}	t	2026-09-28 14:00:05.596135
0ad6201f-abd9-4906-abb7-8839bbb62832	7	\N		2026-10-05	2026-10-08	{"pickup": {"datetime": "2026-10-05T10:00:00Z", "location": {"city_id": 1}}, "dropoff": {"datetime": "2026-10-08T10:00:00Z", "location": {"city_id": 1}}}	USD	75.00	{"taxes": 0, "total": 75, "base_price": 75, "extras_price": 0}	t	2026-09-28 14:05:00.631711
8c6787b7-0971-40ec-8036-91b2489dbdf9	6	\N		2026-10-05	2026-10-08	{"pickup": {"datetime": "2026-10-05T10:00:00Z", "location": {"city_id": 1}}, "dropoff": {"datetime": "2026-10-08T10:00:00Z", "location": {"city_id": 1}}}	USD	156.00	{"taxes": 0, "total": 156, "base_price": 156, "extras_price": 0}	t	2026-09-28 14:07:44.346375
\.


--
-- Data for Name: gds_webhooks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.gds_webhooks (id, url, events, secret, "creadoEn") FROM stdin;
663c883a-7d7a-4c67-8dd7-d1e0522d4988	http://localhost:4001/hook	CAR_ORDER_CONFIRMED,CAR_ORDER_CANCELLED	\N	2026-09-28 14:04:59.438324
29687b16-bdf5-4ce9-9fad-314d36d858f2	http://localhost:4001/hook	CAR_ORDER_CONFIRMED,CAR_ORDER_CANCELLED	\N	2026-09-28 14:07:43.678309
\.


--
-- Data for Name: reservas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.reservas (id, codigo, "vehiculoId", "sucursalRecogidaId", "sucursalDevolucionId", "fechaRecogida", "horaRecogida", "fechaDevolucion", "horaDevolucion", "nombreCliente", email, telefono, dias, total, estado, "creadaEn", "cuentaId", "pagoReferencia", "tarjetaUltimos4") FROM stdin;
1	AS-DWJX56	1	1	1	2026-12-01	10:00	2026-12-05	10:00	Cliente Uno	cliente1@correo.com	0991234567	4	96.00	CONFIRMADA	2026-10-07 03:20:15.160017	1	SIM-4C1758E20031	1111
2	AS-ST3Y33	3	1	1	2026-12-10	10:00	2026-12-14	10:00	Cliente Dos	cliente2@correo.com	0991234567	4	272.00	CONFIRMADA	2026-10-07 03:20:23.763028	2	SIM-FD50316931A0	1111
3	AS-FL9LNK	30	5	5	2026-10-07	10:00	2026-10-11	10:00	Cliente Dos	cliente2@correo.com	0991234567	4	112.00	CONFIRMADA	2026-10-07 03:20:58.357667	2	SIM-F0E03713043D	1111
\.


--
-- Data for Name: sucursales; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sucursales (id, nombre, ciudad, direccion, "esAeropuerto") FROM stdin;
1	Aeropuerto Mariscal Sucre	Quito	Aeropuerto Internacional Mariscal Sucre, Tababela	t
2	Quito La Carolina	Quito	Av. República del Salvador y Naciones Unidas	f
3	Aeropuerto José Joaquín de Olmedo	Guayaquil	Av. de las Américas, Guayaquil	t
4	Guayaquil Centro	Guayaquil	Av. 9 de Octubre y Malecón Simón Bolívar	f
5	Cuenca Centro	Cuenca	Av. Remigio Crespo y Av. Solano, Cuenca	f
6	Aeropuerto Eloy Alfaro	Manta	Aeropuerto Eloy Alfaro, Manta	t
\.


--
-- Data for Name: vehiculos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.vehiculos (id, marca, modelo, anio, categoria, transmision, pasajeros, maletas, puertas, combustible, "aireAcondicionado", "precioPorDia", "sucursalId") FROM stdin;
1	Chevrolet	Spark GT	2024	ECONOMICO	MANUAL	4	1	5	GASOLINA	t	24.00	1
2	Kia	Rio	2024	COMPACTO	AUTOMATICA	5	2	4	GASOLINA	t	32.00	1
3	Hyundai	Tucson	2024	SUV	AUTOMATICA	5	3	5	GASOLINA	t	68.00	1
4	Toyota	Hilux	2023	CAMIONETA	MANUAL	5	3	4	DIESEL	t	85.00	1
5	Toyota	Land Cruiser Prado	2023	SUV	AUTOMATICA	7	4	5	DIESEL	t	135.00	1
6	Honda	Civic	2024	INTERMEDIO	AUTOMATICA	5	3	4	GASOLINA	t	52.00	1
7	Volkswagen	Gol	2023	ECONOMICO	MANUAL	5	2	5	GASOLINA	t	25.00	1
8	Renault	Kwid	2024	ECONOMICO	MANUAL	4	1	5	GASOLINA	t	22.00	2
9	Chevrolet	Onix	2024	COMPACTO	MANUAL	5	2	4	GASOLINA	t	30.00	2
10	Kia	Sportage	2024	SUV	AUTOMATICA	5	3	5	HIBRIDO	t	74.00	2
11	Hyundai	H1	2023	VAN	MANUAL	9	5	5	DIESEL	t	95.00	2
12	BMW	Serie 3	2024	LUJO	AUTOMATICA	5	3	4	GASOLINA	t	150.00	2
13	Tesla	Model 3	2024	LUJO	AUTOMATICA	5	3	4	ELECTRICO	t	125.00	2
14	Kia	Carnival	2024	VAN	AUTOMATICA	8	5	5	DIESEL	t	118.00	2
15	Jeep	Compass	2024	SUV	AUTOMATICA	5	3	5	GASOLINA	t	82.00	2
16	Kia	Picanto	2024	ECONOMICO	AUTOMATICA	4	1	5	GASOLINA	t	26.00	3
17	Toyota	Corolla	2024	INTERMEDIO	AUTOMATICA	5	3	4	GASOLINA	t	45.00	3
18	Chevrolet	Captiva	2024	SUV	AUTOMATICA	7	3	5	GASOLINA	t	70.00	3
19	Mercedes-Benz	Clase C	2024	LUJO	AUTOMATICA	5	3	4	GASOLINA	t	140.00	3
20	Toyota	RAV4	2024	SUV	AUTOMATICA	5	4	5	HIBRIDO	t	88.00	3
21	Volkswagen	Amarok	2023	CAMIONETA	AUTOMATICA	5	4	4	DIESEL	t	110.00	3
22	Hyundai	Accent	2024	COMPACTO	MANUAL	5	2	4	GASOLINA	t	29.00	3
23	Chevrolet	Sail	2023	ECONOMICO	MANUAL	5	2	4	GASOLINA	t	23.00	4
24	Nissan	Kicks	2024	SUV	AUTOMATICA	5	2	5	GASOLINA	t	58.00	4
25	Toyota	Fortuner	2023	SUV	AUTOMATICA	7	3	5	DIESEL	t	98.00	4
26	Chevrolet	Tracker	2024	SUV	AUTOMATICA	5	3	5	GASOLINA	t	56.00	4
27	Kia	Cerato	2024	INTERMEDIO	AUTOMATICA	5	3	4	GASOLINA	t	44.00	4
28	Mitsubishi	L200	2023	CAMIONETA	MANUAL	5	3	4	DIESEL	t	86.00	4
29	Toyota	Yaris	2024	COMPACTO	AUTOMATICA	5	2	4	GASOLINA	t	34.00	4
30	Suzuki	Swift	2024	COMPACTO	MANUAL	5	2	5	GASOLINA	t	28.00	5
31	Mazda	CX-5	2024	SUV	AUTOMATICA	5	3	5	GASOLINA	t	72.00	5
32	Hyundai	Staria	2024	VAN	AUTOMATICA	9	5	5	DIESEL	t	120.00	5
33	Hyundai	Santa Fe	2024	SUV	AUTOMATICA	7	4	5	DIESEL	t	105.00	5
34	Volkswagen	T-Cross	2024	SUV	AUTOMATICA	5	3	5	GASOLINA	t	62.00	5
35	Mazda	3	2024	INTERMEDIO	AUTOMATICA	5	3	4	GASOLINA	t	48.00	5
36	Nissan	Frontier	2023	CAMIONETA	MANUAL	5	3	4	DIESEL	t	84.00	5
37	Kia	Soluto	2024	ECONOMICO	MANUAL	5	2	4	GASOLINA	t	25.00	6
38	Toyota	Corolla Cross	2024	SUV	AUTOMATICA	5	3	5	HIBRIDO	t	76.00	6
39	Ford	Ranger	2023	CAMIONETA	MANUAL	5	3	4	DIESEL	t	88.00	6
40	Honda	HR-V	2024	SUV	AUTOMATICA	5	3	5	GASOLINA	t	66.00	6
41	Hyundai	Creta	2024	SUV	AUTOMATICA	5	3	5	GASOLINA	t	60.00	6
42	Kia	Seltos	2024	SUV	AUTOMATICA	5	3	5	GASOLINA	t	64.00	6
\.


--
-- Name: cuentas_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.cuentas_id_seq', 3, true);


--
-- Name: reservas_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.reservas_id_seq', 3, true);


--
-- Name: sucursales_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.sucursales_id_seq', 8, true);


--
-- Name: vehiculos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.vehiculos_id_seq', 42, true);


--
-- Name: cuentas PK_1176afa6e483a49bee4ad8d543e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas
    ADD CONSTRAINT "PK_1176afa6e483a49bee4ad8d543e" PRIMARY KEY (id);


--
-- Name: gds_previews PK_279bfc1e2fe129b1be6b5c12c98; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gds_previews
    ADD CONSTRAINT "PK_279bfc1e2fe129b1be6b5c12c98" PRIMARY KEY (id);


--
-- Name: reservas PK_309c659053bcf5e56f8e40a2b42; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT "PK_309c659053bcf5e56f8e40a2b42" PRIMARY KEY (id);


--
-- Name: gds_holds PK_45c0cb855663c5addd2e95c19ee; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gds_holds
    ADD CONSTRAINT "PK_45c0cb855663c5addd2e95c19ee" PRIMARY KEY (id);


--
-- Name: gds_webhooks PK_4b7e1d44bfa27285b22b0df04f1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gds_webhooks
    ADD CONSTRAINT "PK_4b7e1d44bfa27285b22b0df04f1" PRIMARY KEY (id);


--
-- Name: gds_orders PK_705cfb188de1eb06f87495c54ca; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gds_orders
    ADD CONSTRAINT "PK_705cfb188de1eb06f87495c54ca" PRIMARY KEY (id);


--
-- Name: gds_idempotencia PK_a7edef26c4fda089da2afdc703d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gds_idempotencia
    ADD CONSTRAINT "PK_a7edef26c4fda089da2afdc703d" PRIMARY KEY (clave);


--
-- Name: vehiculos PK_bc0b75baae377e599cd46b502e1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehiculos
    ADD CONSTRAINT "PK_bc0b75baae377e599cd46b502e1" PRIMARY KEY (id);


--
-- Name: sucursales PK_c2232960c9e458db5b18d35eeba; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sucursales
    ADD CONSTRAINT "PK_c2232960c9e458db5b18d35eeba" PRIMARY KEY (id);


--
-- Name: cuentas UQ_01efc035e062d3c6968c4a3186a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas
    ADD CONSTRAINT "UQ_01efc035e062d3c6968c4a3186a" UNIQUE (email);


--
-- Name: gds_orders UQ_8a15c1deb0c72fe86acbf854b90; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gds_orders
    ADD CONSTRAINT "UQ_8a15c1deb0c72fe86acbf854b90" UNIQUE (locator);


--
-- Name: reservas UQ_f1168a0adfa9811118846cc8fb5; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT "UQ_f1168a0adfa9811118846cc8fb5" UNIQUE (codigo);


--
-- Name: reservas FK_1f3c10aab81fd46a13e4d62defe; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT "FK_1f3c10aab81fd46a13e4d62defe" FOREIGN KEY ("vehiculoId") REFERENCES public.vehiculos(id) ON DELETE RESTRICT;


--
-- Name: reservas FK_53eda0bc50b6ecbb7932af03921; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT "FK_53eda0bc50b6ecbb7932af03921" FOREIGN KEY ("sucursalRecogidaId") REFERENCES public.sucursales(id) ON DELETE RESTRICT;


--
-- Name: reservas FK_bb3bd5da483583e10f46a8ada54; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT "FK_bb3bd5da483583e10f46a8ada54" FOREIGN KEY ("sucursalDevolucionId") REFERENCES public.sucursales(id) ON DELETE RESTRICT;


--
-- Name: vehiculos FK_f5c5e53a56ff44838cb9da1f86d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehiculos
    ADD CONSTRAINT "FK_f5c5e53a56ff44838cb9da1f86d" FOREIGN KEY ("sucursalId") REFERENCES public.sucursales(id) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict DeA2jxvm4vJRNxejQrvIReXOzCZ40D5fL6SJcY8NTaS1AhoaNNgqcwaHzmRXDAR


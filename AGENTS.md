# PROJECT ARCHITECTURE & DEVELOPMENT GUIDELINES — NDIAYE

## 1. GLOBAL PROJECT STRUCTURE (Next.js App Router)
Le dépôt doit respecter une séparation stricte des dossiers pour maintenir un code propre et modulaire :

- Dossier src/app : Contient les Pages, les Route Handlers et les Next.js Server Actions pour les mutations de données.
- Dossier src/components : Regroupe les Composants UI réutilisables.
- Dossier src/lib/supabase : Gère l'initialisation des clients Supabase SSR (client, serveur, actions) via @supabase/ssr.
- Dossier src/services : Représente la Couche Répertoire/Service. C'est le SEUL et UNIQUE endroit autorisé à communiquer avec la base de données ou les outils d'IA. Il contient le fichier base.service.ts (la classe abstraite CRUD) et les sous-services dédiés par entité (profile.service.ts, semaine.service.ts, echeance.service.ts).
- Dossier src/types : Centralise les interfaces TypeScript globales et les définitions automatiques des types de la base de données.
- Dossier supabase/migrations : Stocke les scripts de migration SQL pour PostgreSQL.

---

## 2. BACKEND DESIGN PATTERNS & DATA FLOW
Pour éviter les fuites de données et le code spaghettis, le flux d'informations doit toujours être unidirectionnel : Interface Utilisateur -> Couche Service -> Supabase PostgreSQL.

### 2.1 La Hiérarchie du Pattern Service
- Classe de Base Abstraite : Une classe TypeScript générique nommée BaseService encapsule les fonctions CRUD universelles de Supabase (les méthodes getAll, getById, create, update, delete). Elle reçoit le nom de la table et l'instance SupabaseClient à l'initialisation.
- Sous-Services Dédiés : Chaque table possède son propre service qui hérite directement de BaseService (par exemple : la classe EcheanceService étend BaseService). Les requêtes complexes, les filtres avancés, les appels RPC ou les tris spécifiques au système sénégalais doivent être isolés exclusivement dans ces classes enfants.

### 2.2 Gestion du Client Supabase SSR dans Next.js
- Les Server Components et les Server Actions doivent toujours utiliser un client Supabase configuré pour le stockage et la lecture des cookies côté serveur via le package @supabase/ssr.
- Les pages publiques côté client utilisent le client public standard. Il est strictement interdit d'exposer la clé de rôle service_role (clé administrateur) dans la logique accessible par le navigateur ou dans les scripts côté client.

---

## 3. MODERN LANGCHAIN ARCHITECTURE & ANTI-HALLUCINATION
Pour éliminer les hallucinations de format et garantir la fiabilité de la planification de l'agent Ndiaye, appliquez rigoureusement les standards de l'écosystème LangChain moderne (v0.3+) :

### 3.1 Interdiction Formelle des API Obsolètes
- N'utilisez JAMAIS l'ancienne méthode initialize_agent() ou la classe monolithique LLMChain.
- N'utilisez JAMAIS les anciens parseurs de texte comme StructuredOutputParser ou des invites textuelles manuelles ("Réponds en JSON") pour parser la sortie. Cela provoque des coupures de chaînes et des crashs de parsing en production.

### 3.2 Syntaxe LCEL (LangChain Expression Language) Obligatoire
- Tout flux d'IA doit être construit sous forme de chaîne de runnables découplés à l'aide de la méthode pipe (Exemple conceptuel : chain = prompt.pipe(model)).
- Si le flux nécessite des boucles d'actions complexes (Agent avec outils), migrez l'orchestration de bas niveau vers LangGraph au lieu d'utiliser l'ancien AgentExecutor déprécié.

### 3.3 Sorties Structurées Natives (withStructuredOutput + Zod)
- Définissez le schéma de données du planning sénégalais via la bibliothèque Zod.
- Liez ce schéma directement au modèle d'IA (ChatGoogleGenerativeAI pour Gemini Flash) via la méthode native .withStructuredOutput(votreSchemaZod). Cela force le modèle à utiliser l'API outil native (Structured Outputs) du fournisseur, garantissant un JSON 100% valide et typé sans texte parasite autour.

### 3.4 Isolation du Contexte et Mode Strict
- Utilisez impérativement ChatPromptTemplate.fromMessages pour encapsuler les instructions système de Ndiaye séparément des données d'entrée.
- Injectez les données Supabase (coefficients par classe/série, échéances, emploi du temps école) comme variables typées dans le prompt pour empêcher l'IA d'inventer des coefficients ou des règles inexistantes au Sénégal.

---

## 4. MULTI-MODE INTERFACE ARCHITECTURE (OVERLAY vs STANDARD)
L'application doit permettre à l'utilisateur de basculer instantanément entre plusieurs modes d'affichage (notamment le mode Overlay/Superposition et le mode Standard/Plein écran). L'architecture logicielle doit impérativement prévoir cette flexibilité dès la V1 :

- ** découplage UI et État :** Le mode d'affichage actif doit être géré par un état global ou un gestionnaire de contexte (Context Provider) accessible de partout, sans forcer un re-calcul ou une ré-exécution des appels de services backend.
- ** Contrats d'API Agnostiques :** La structure des données renvoyée par la couche Service (les plannings, les sessions et les notes pédagogiques de Ndiaye) doit rester rigoureusement identique, quel que soit le mode d'affichage choisi par le client. Le backend fournit la donnée brute, la vue gère l'affichage (fenêtre flottante ou page standard).

---

## 5. DEVELOPMENT BEST PRACTICES & OPTIMIZATIONS
- Préparation au Mode Hors-Ligne : Le schéma de données est optimisé pour les applications offline. Le planning hebdomadaire cyclique (table sessions) sert de gabarit permanent. L'application peut charger les données du jour actuel directement depuis son cache local sans solliciter le réseau internet.
- Optimisation PostgreSQL : Toutes les clés étrangères et les colonnes fréquemment filtrées dans les requêtes (en particulier la colonne user_id et la colonne day_of_week) doivent être explicitement indexées dans les scripts de migration pour garantir une vitesse de lecture maximale.
- Sérialisation des États : Utilisez prioritairement les Next.js Server Actions pour modifier ou insérer les données de la base depuis l'interface. Les Route Handlers (le dossier api) sont strictement réservés aux webhooks d'API, aux tâches de fond lourdes ou aux communications externes de microservices.
- RLS Obligatoire (Row Level Security) : Chaque table créée dans Supabase doit impérativement activer les politiques RLS. Aucune requête ne doit pouvoir lire ou modifier les données d'un autre élève sans une règle explicite vérifiant l'ID de l'utilisateur connecté via auth.uid().
- Revalidation sélective du cache : Lors de la modification du profil ou du planning via une Server Action, utiliser la méthode revalidatePath ou revalidateTag de Next.js pour rafraîchir instantanément les Server Components dépendants sans recharger toute la page.

---

## 6. STRICT PROHIBITIONS & BANNED PRACTICES (GUARDRAILS)
- INTERDICTION de requêter directement la DB : Appeler la fonction supabase.from directement dans une page Next.js, un composant d'interface, un layout ou une Server Action est strictement interdit. Toutes les opérations de base de données sans exception doivent passer par leur classe Service dédiée.
- INTERDICTION d'abuser du temps réel en DB : Ne pas utiliser de tables ou de lignes PostgreSQL pour diffuser des changements d'interface éphémères (comme l'indicateur social L'élève Amadou est en train de réviser). Ces états volatils doivent contourner l'écriture en base et transiter uniquement via les canaux Websocket de Supabase Broadcast et Presence pour maintenir un coût de stockage nul.
- INTERDICTION de générer des lignes quotidiennes : Ne pas insérer de lignes de planning jour par jour pour toute l'année scolaire de 9 mois. Toutes les structures doivent reposer sur le gabarit cyclique de 7 jours (sessions) complété par une table d'historique uniquement alimentée lorsque l'élève valide une révision.
- INTERDICTION des jointures inter-bases : Ne jamais forcer des relations ou des transactions croisées entre des moteurs de données différents. Toutes les opérations relationnelles doivent rester localisées et centralisées au sein de Supabase PostgreSQL.
- INTERDICTION d'exposer les secrets d'environnement : Ne jamais préfixer les variables contenant des clés privées ou des tokens d'IA par NEXT_PUBLIC_. Tout token sensible (comme le token Gemini ou la clé Supabase de service) doit rester invisible pour le navigateur.
import getpass
import requests

BASE_URL = "http://127.0.0.1:8000"


def main():
    session = requests.Session()

    print("\n=== TracePoint Terminal Chat ===")
    email = input("Email: ").strip()
    password = getpass.getpass("Password: ")

    try:
        response = session.post(
            f"{BASE_URL}/api/v1/auth/login",
            json={"email": email, "password": password},
            timeout=15,
        )
        if response.status_code != 200:
            print("Login failed:", response.status_code, response.text)
            return

        user = response.json()["user"]
        print(f"\nSigned in as {user['name']}.")

        response = session.get(
            f"{BASE_URL}/api/v1/investigations",
            timeout=15,
        )
        if response.status_code != 200:
            print("Could not list investigations:", response.status_code)
            return

        cases = response.json().get("items", [])
        if not cases:
            print("No investigations found for this account.")
            return

        print("\nYour investigations:")
        for case in cases:
            print(
                f"  ID {case['id']} | {case['title']} | "
                f"events: {case.get('event_count', '?')}"
            )

        while True:
            case_id = input("\nEnter investigation ID (or q to quit): ").strip()
            if case_id.lower() == "q":
                return
            if any(str(case["id"]) == case_id for case in cases):
                break
            print("Please enter an ID from the list.")

        print("\nChat started. Type 'exit' to stop.")
        conversation_history = []

        while True:
            question = input("\nYou: ").strip()
            if question.lower() in {"exit", "quit", "q"}:
                break
            if len(question) < 3:
                print("Please enter a longer question.")
                continue

            try:
                response = session.post(
                    f"{BASE_URL}/api/v1/investigations/{case_id}/ask",
                    json={
                        "question": question,
                        "conversation_history": conversation_history[-10:],
                    },
                    timeout=90,
                )
                if response.status_code != 200:
                    print(
                        f"\nRequest failed ({response.status_code}): "
                        f"{response.text}"
                    )
                    continue

                result = response.json()
                conversation_history.append({
                    "role": "user",
                    "content": question,
                })
                conversation_history.append({
                    "role": "assistant",
                    "content": result.get("answer", ""),
                })

                print("\nTracePoint:", result.get("answer", "(no answer)"))
                print("\nEvidence sources:")
                sources = result.get("sources", [])
                if not sources:
                    print("  No linked evidence sources returned.")

                for source in sources:
                    print(
                        f"  [{source.get('id', '?')}] "
                        f"{source.get('timestamp') or 'No timestamp'} | "
                        f"{source.get('event_type') or 'Unknown event'} | "
                        f"user={source.get('username') or 'unknown'} | "
                        f"{source.get('message') or 'No message'}"
                    )

                print(
                    f"\nModel: {result.get('model', 'unknown')} | "
                    f"Events considered: "
                    f"{result.get('events_considered', 0)}"
                )

            except requests.RequestException as error:
                print("Connection error:", error)

    finally:
        session.close()


if __name__ == "__main__":
    main()

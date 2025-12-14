#!/bin/bash

# Test script for Story 6.6: Data Model Extensions
# Tests all new and updated endpoints

echo "=== Story 6.6 API Endpoint Tests ==="
echo ""

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:3000"

# Test 1: POST /interviews/start with extended fields
echo "Test 1: POST /interviews/start (with expertName and industry)"
RESPONSE=$(curl -s -X POST $BASE_URL/interviews/start \
  -H "Content-Type: application/json" \
  -d '{"role":"Finance Director","expertName":"Jane Doe","industry":"Healthcare Finance"}')
INTERVIEW_ID=$(echo $RESPONSE | jq -r '.id')
echo $RESPONSE | jq .
if [[ $(echo $RESPONSE | jq -r '.expertName') == "Jane Doe" ]]; then
  echo -e "${GREEN}✓ PASS${NC}\n"
else
  echo -e "${RED}✗ FAIL${NC}\n"
fi

# Test 2: GET /interviews/:id
echo "Test 2: GET /interviews/:id"
RESPONSE=$(curl -s -X GET $BASE_URL/interviews/$INTERVIEW_ID)
echo $RESPONSE | jq .
if [[ $(echo $RESPONSE | jq -r '.id') == $INTERVIEW_ID ]]; then
  echo -e "${GREEN}✓ PASS${NC}\n"
else
  echo -e "${RED}✗ FAIL${NC}\n"
fi

# Test 3: PUT /interviews/:id
echo "Test 3: PUT /interviews/:id"
RESPONSE=$(curl -s -X PUT $BASE_URL/interviews/$INTERVIEW_ID \
  -H "Content-Type: application/json" \
  -d '{"expertName":"Jane M. Doe","industry":"Public Healthcare","phase":"core-frameworks"}')
echo $RESPONSE | jq .
if [[ $(echo $RESPONSE | jq -r '.phase') == "core-frameworks" ]] && [[ $(echo $RESPONSE | jq -r '.expertName') == "Jane M. Doe" ]]; then
  echo -e "${GREEN}✓ PASS${NC}\n"
else
  echo -e "${RED}✗ FAIL${NC}\n"
fi

# Test 4: Add some messages to the interview
echo "Test 4: Adding messages for transcript test"
curl -s -X POST $BASE_URL/interviews/$INTERVIEW_ID/message \
  -H "Content-Type: application/json" \
  -d '{"message":"I have managed healthcare finance teams for 15 years"}' > /dev/null
sleep 1
curl -s -X POST $BASE_URL/interviews/$INTERVIEW_ID/message \
  -H "Content-Type: application/json" \
  -d '{"message":"My focus is on budget optimization and compliance"}' > /dev/null
echo -e "${GREEN}✓ Messages added${NC}\n"

# Test 5: GET /interviews/:id/transcript
echo "Test 5: GET /interviews/:id/transcript"
RESPONSE=$(curl -s -X GET $BASE_URL/interviews/$INTERVIEW_ID/transcript)
echo $RESPONSE | jq .
if [[ $(echo $RESPONSE | jq -r '.messageCount') -gt 0 ]]; then
  echo -e "${GREEN}✓ PASS${NC}\n"
else
  echo -e "${RED}✗ FAIL${NC}\n"
fi

# Test 6: POST /interviews/:id/complete
echo "Test 6: POST /interviews/:id/complete"
RESPONSE=$(curl -s -X POST $BASE_URL/interviews/$INTERVIEW_ID/complete)
echo $RESPONSE | jq .
if [[ $(echo $RESPONSE | jq -r '.phase') == "complete" ]] && [[ $(echo $RESPONSE | jq -r '.completedAt') != "null" ]]; then
  echo -e "${GREEN}✓ PASS${NC}\n"
else
  echo -e "${RED}✗ FAIL${NC}\n"
fi

# Wait for auto-snapshot to complete
echo "Waiting for auto-snapshot..."
sleep 3

# Test 7: Build a persona
echo "Test 7: POST /personas/build"
RESPONSE=$(curl -s -X POST $BASE_URL/personas/build \
  -H "Content-Type: application/json" \
  -d "{\"interviewId\":\"$INTERVIEW_ID\"}")
PERSONA_ID=$(echo $RESPONSE | jq -r '.id')
echo $RESPONSE | jq '. | {id, role, status, createdAt}'
if [[ $PERSONA_ID != "null" ]] && [[ $PERSONA_ID != "" ]]; then
  echo -e "${GREEN}✓ PASS${NC}\n"
else
  echo -e "${RED}✗ FAIL${NC}\n"
fi

# Test 8: PUT /personas/:id
echo "Test 8: PUT /personas/:id"
RESPONSE=$(curl -s -X PUT $BASE_URL/personas/$PERSONA_ID \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane M. Doe","organization":"General Hospital","yearsOfExperience":15,"bio":"Healthcare finance expert","traits":["analytical","compliant","strategic"],"expertise":["budgeting","compliance","optimization"],"status":"active"}')
echo $RESPONSE | jq '. | {id, name, organization, yearsOfExperience, status, traits, expertise}'
if [[ $(echo $RESPONSE | jq -r '.name') == "Jane M. Doe" ]] && [[ $(echo $RESPONSE | jq -r '.status') == "active" ]]; then
  echo -e "${GREEN}✓ PASS${NC}\n"
else
  echo -e "${RED}✗ FAIL${NC}\n"
fi

# Test 9: Error handling - 404 for non-existent interview
echo "Test 9: Error handling - GET /interviews/:id (404)"
RESPONSE=$(curl -s -X GET $BASE_URL/interviews/nonexistent)
echo $RESPONSE | jq .
if [[ $(echo $RESPONSE | jq -r '.error') == "Interview not found: nonexistent" ]]; then
  echo -e "${GREEN}✓ PASS${NC}\n"
else
  echo -e "${RED}✗ FAIL${NC}\n"
fi

# Test 10: Error handling - 404 for non-existent persona
echo "Test 10: Error handling - PUT /personas/:id (404)"
RESPONSE=$(curl -s -X PUT $BASE_URL/personas/nonexistent \
  -H "Content-Type: application/json" \
  -d '{"name":"Test"}')
echo $RESPONSE | jq .
if [[ $(echo $RESPONSE | jq -r '.error') == "Persona not found: nonexistent" ]]; then
  echo -e "${GREEN}✓ PASS${NC}\n"
else
  echo -e "${RED}✗ FAIL${NC}\n"
fi

echo "=== All tests completed ==="

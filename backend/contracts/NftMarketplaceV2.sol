// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface IERC721Ownable is IERC721 {
  function owner() external returns (address);
}

contract NftMarketplaceV2 is ReentrancyGuard, Ownable {
  constructor() Ownable() {}

  /////////////////////
  //     Events      //
  /////////////////////
  event ItemListed(
    address indexed seller,
    address indexed nftAddress,
    uint256 indexed tokenId,
    uint256 price
  );

  event ItemCanceled(
    address indexed seller,
    address indexed nftAddress,
    uint256 indexed tokenId
  );

  event ItemBought(
    address indexed buyer,
    address indexed nftAddress,
    uint256 indexed tokenId,
    uint256 price
  );

  event CollectionAdded(address indexed deployer, address indexed nftAddress);

  /////////////////////
  //     Storage     //
  /////////////////////

  /// @notice NftAddress -> Token ID -> Price
  mapping(address => mapping(uint256 => uint256)) public listings;

  /// @notice UserAddress -> Deployed NFT contract addresses
  mapping(address => address[]) public nfts;

  /// @notice Marketplace fee
  uint256 public listingFee = 0.0001 ether;

  /////////////////////
  //    Modifiers    //
  /////////////////////

  modifier notYetListed(
    address nftAddress,
    uint256 tokenId,
    address owner
  ) {
    require(listings[nftAddress][tokenId] == 0, "Shouldn't be listed.");
    _;
  }

  modifier alreadyListed(address nftAddress, uint256 tokenId) {
    require(listings[nftAddress][tokenId] > 0, "Should be listed.");
    _;
  }

  modifier tokenOwner(
    address nftAddress,
    uint256 tokenId,
    address spender
  ) {
    IERC721 nft = IERC721(nftAddress);
    address owner = nft.ownerOf(tokenId);
    require(spender == owner, "Should be owner of the token.");
    _;
  }

  /////////////////////
  //    Functions    //
  /////////////////////

  /// @notice Method for listing an NFT
  /// @param _nftAddress Address of NFT contract
  /// @param _tokenId Token ID of NFT
  /// @param _price Sale price
  function listItem(
    address _nftAddress,
    uint256 _tokenId,
    uint256 _price
  )
    external
    payable
    nonReentrant
    notYetListed(_nftAddress, _tokenId, msg.sender)
    tokenOwner(_nftAddress, _tokenId, msg.sender)
  {
    require(_price > 0, "Price not set.");
    require(msg.value == listingFee, "Listing fee not met.");
    IERC721 nft = IERC721(_nftAddress);
    require(
      nft.getApproved(_tokenId) == address(this),
      "Approve marketplace first."
    );

    // Set the price of the token (which lists it in the marketplace)
    listings[_nftAddress][_tokenId] = _price;

    // Send the listing fee to the marketplace owner
    address owner = owner();
    (bool success, ) = payable(owner).call{value: msg.value}("");
    require(success, "Transfer failed");

    // Emit event
    emit ItemListed(msg.sender, _nftAddress, _tokenId, _price);
  }

  /// @notice Method for cancelling a listing
  /// @param _nftAddress Address of NFT contract
  /// @param _tokenId Token ID of NFT
  function cancelListing(address _nftAddress, uint256 _tokenId)
    external
    alreadyListed(_nftAddress, _tokenId)
  {
    IERC721 nft = IERC721(_nftAddress);
    address listingOwner = nft.ownerOf(_tokenId);
    require(
      msg.sender == listingOwner || msg.sender == owner() || msg.sender == _nftAddress,
      "Caller isn't owner or nft contract."
    );
    delete (listings[_nftAddress][_tokenId]);
    emit ItemCanceled(msg.sender, _nftAddress, _tokenId);
  }

  /// @notice Method for buying listing
  /// @notice The owner of the NFT needs to approve the Marketplace first
  /// @param _nftAddress Address of NFT contract
  /// @param _tokenId Token ID of NFT
  function buyItem(address _nftAddress, uint256 _tokenId)
    external
    payable
    alreadyListed(_nftAddress, _tokenId)
    nonReentrant
  {
    require(msg.value == listings[_nftAddress][_tokenId], "Price mismatch.");
    IERC721 nft = IERC721(_nftAddress);
    address owner = nft.ownerOf(_tokenId);
    delete (listings[_nftAddress][_tokenId]);
    IERC721(_nftAddress).safeTransferFrom(owner, msg.sender, _tokenId);
    (bool success, ) = payable(owner).call{value: msg.value}("");
    require(success, "Transfer failed");
    emit ItemBought(msg.sender, _nftAddress, _tokenId, msg.value);
  }

  /// @notice Method for storing addresses of NFT contracts deployed by users
  function addCollection(address _nftAddress) external {
    require(
      msg.sender == IERC721Ownable(_nftAddress).owner(),
      "Only collection owner can add it."
    );
    for (uint256 i = 0; i < nfts[msg.sender].length; i++) {
      require(nfts[msg.sender][i] != _nftAddress, "Collection already exists.");
    }
    nfts[msg.sender].push(_nftAddress);
    emit CollectionAdded(msg.sender, _nftAddress);
  }

  /// @notice Method for changing the listing fee
  function setListingFee(uint256 _newFee) external onlyOwner {
    require(_newFee > 0, "Fee should be above zero.");
    listingFee = _newFee;
  }
}
